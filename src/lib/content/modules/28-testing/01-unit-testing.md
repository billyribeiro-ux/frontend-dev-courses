# Unit Testing with Vitest

Writing code that works today is one thing. Writing code that still works after you refactor, add features, and fix bugs is another. **Tests** are your safety net — they verify that your code does what you expect, and they catch regressions before your users do.

But unit testing is not just about catching bugs. It shapes how you design code. When a function is hard to test, it usually means it has too many responsibilities, hidden dependencies, or tangled side effects. The act of writing tests pushes you toward smaller, purer, more composable functions — and that is better architecture regardless of the tests themselves.

Vitest is the testing framework built for the Vite ecosystem, which means it works perfectly with SvelteKit out of the box. It is fast (tests run in under a second even in large projects), has a familiar API (almost identical to Jest), supports TypeScript without extra configuration, and shares the same config and plugin pipeline as your dev server. If Vite can resolve an import, Vitest can too.

## Setting Up Vitest in SvelteKit

SvelteKit projects created with `create-svelte` include Vitest by default. If you need to add it manually:

```bash
npm install -D vitest
```

Add test scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

Vitest reads your `vite.config.ts` automatically, so path aliases like `$lib` just work. But you can (and should) add test-specific configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**'],
    globals: true,           // Optional: use describe/it/expect without imports
    restoreMocks: true,      // Automatically restore mocks between tests
    sequence: {
      shuffle: true          // Randomize test order to catch hidden dependencies
    }
  }
});
```

The `restoreMocks: true` option is critically important. Without it, a mock created in one test leaks into the next test, causing mysterious failures that depend on test execution order. Always enable it.

The `sequence.shuffle` option randomizes test order on every run. This catches a common class of bugs where Test A accidentally sets up state that Test B depends on. If your tests only pass in a specific order, they have hidden coupling.

### Where to Place Test Files

There are two conventions. Place test files next to the code they test:

```
src/lib/utils/
  format.ts
  format.test.ts
  validate.ts
  validate.test.ts
```

Or use a `__tests__` directory:

```
src/lib/utils/
  __tests__/
    format.test.ts
    validate.test.ts
  format.ts
  validate.ts
```

The co-located approach (files side by side) is strongly preferred in the SvelteKit ecosystem. It makes imports shorter, makes it obvious when a file lacks tests, and keeps related code together when you browse the file tree. SvelteKit already excludes test files from the production build, so there is no bloat concern.

## Test Anatomy: Arrange, Act, Assert

Every well-structured test follows three phases:

1. **Arrange** — Set up the preconditions: create objects, configure mocks, prepare input data
2. **Act** — Execute the code under test: call the function, trigger the event
3. **Assert** — Verify the outcome: check return values, inspect side effects, confirm errors

```typescript
// src/lib/utils/cart.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './cart';

describe('calculateTotal', () => {
  it('applies a percentage discount to the subtotal', () => {
    // Arrange
    const items = [
      { name: 'Widget', price: 2500, quantity: 2 },
      { name: 'Gadget', price: 4000, quantity: 1 }
    ];
    const discount = 0.1; // 10%

    // Act
    const total = calculateTotal(items, discount);

    // Assert
    expect(total).toBe(8100); // (2500*2 + 4000) * 0.9 = 8100
  });
});
```

The three phases do not need comments in practice — experienced developers recognize the pattern. But when you are learning, the mental model helps: "What do I need? What am I testing? What should happen?"

### Naming Tests for Clarity

Test names should read like specifications. When a test fails, the name should tell you exactly what broke without opening the file:

```typescript
// Bad — vague, does not describe the expectation
it('works correctly', () => { ... });
it('test 1', () => { ... });

// Good — describes input condition and expected outcome
it('returns 0 for an empty cart', () => { ... });
it('throws when quantity is negative', () => { ... });
it('rounds to nearest cent when discount produces fractions', () => { ... });
```

Use `describe` blocks to group related tests. Nesting is fine when it adds clarity, but avoid nesting more than two levels deep:

```typescript
describe('calculateTotal', () => {
  describe('with no discount', () => {
    it('sums item prices multiplied by quantities', () => { ... });
    it('returns 0 for an empty array', () => { ... });
  });

  describe('with a percentage discount', () => {
    it('reduces the total by the discount percentage', () => { ... });
    it('clamps discount to 100%', () => { ... });
  });
});
```

## Testing Pure Functions

Pure functions — same input always produces same output, no side effects — are the easiest code to test and the most valuable to cover. Design your utilities as pure functions whenever possible.

```typescript
// src/lib/utils/format.ts
export function formatCurrency(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error('Amount must be a finite number');
  }
  const dollars = Math.abs(cents) / 100;
  const formatted = dollars.toFixed(2);
  return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength - 3).trimEnd();
  return `${truncated}...`;
}
```

```typescript
// src/lib/utils/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, slugify, truncate } from './format';

describe('formatCurrency', () => {
  it('converts cents to dollar string', () => {
    expect(formatCurrency(1299)).toBe('$12.99');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('pads single-digit cents', () => {
    expect(formatCurrency(5)).toBe('$0.05');
  });

  it('handles large amounts', () => {
    expect(formatCurrency(1000000)).toBe('$10000.00');
  });

  it('formats negative amounts with a minus sign', () => {
    expect(formatCurrency(-1299)).toBe('-$12.99');
  });

  it('throws for NaN', () => {
    expect(() => formatCurrency(NaN)).toThrow('Amount must be a finite number');
  });

  it('throws for Infinity', () => {
    expect(() => formatCurrency(Infinity)).toThrow('Amount must be a finite number');
  });
});

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('too   many   spaces')).toBe('too-many-spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugify('  padded  ')).toBe('padded');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('converts underscores to hyphens', () => {
    expect(slugify('snake_case_text')).toBe('snake-case-text');
  });
});

describe('truncate', () => {
  it('returns the full string when under the limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates and adds ellipsis when over the limit', () => {
    expect(truncate('This is a long sentence', 10)).toBe('This i...');
  });

  it('returns the full string when exactly at the limit', () => {
    expect(truncate('exact', 5)).toBe('exact');
  });
});
```

Notice the test coverage strategy: happy path first, then edge cases (zero, negative, empty), then error cases. This is the pattern to follow for every function you test.

## Assertions in Depth

Vitest provides a rich assertion library through `expect`. Understanding which assertion to use and when prevents false positives (tests that pass when they should fail):

```typescript
// Strict equality (===) — use for primitives
expect(value).toBe(5);
expect(name).toBe('Alice');
expect(flag).toBe(true);

// Deep equality — use for objects and arrays
expect(user).toEqual({ name: 'Alice', age: 30 });
expect(items).toEqual([1, 2, 3]);

// IMPORTANT: toBe fails for objects even if they look identical
const a = { x: 1 };
const b = { x: 1 };
expect(a).toBe(b);      // FAILS — different references
expect(a).toEqual(b);   // PASSES — same structure

// toStrictEqual is even stricter than toEqual
expect({ a: 1 }).toEqual({ a: 1, b: undefined });        // PASSES
expect({ a: 1 }).toStrictEqual({ a: 1, b: undefined });  // FAILS

// Truthiness
expect(value).toBeTruthy();     // any truthy value
expect(value).toBeFalsy();      // false, 0, '', null, undefined, NaN
expect(value).toBeNull();       // strictly null
expect(value).toBeUndefined();  // strictly undefined
expect(value).toBeDefined();    // not undefined

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeGreaterThanOrEqual(3);
expect(value).toBeLessThan(10);
expect(value).toBeLessThanOrEqual(10);
expect(0.1 + 0.2).toBeCloseTo(0.3);  // float comparison with tolerance

// Strings
expect(str).toContain('hello');
expect(str).toMatch(/^Error:/);
expect(str).toHaveLength(5);

// Arrays
expect(arr).toContain('item');       // strict equality check for elements
expect(arr).toContainEqual({ id: 1 }); // deep equality check
expect(arr).toHaveLength(3);

// Objects
expect(obj).toHaveProperty('name');
expect(obj).toHaveProperty('address.city', 'Portland');
expect(obj).toMatchObject({ name: 'Alice' });  // partial match

// Exceptions
expect(() => riskyFunction()).toThrow();
expect(() => riskyFunction()).toThrow('specific message');
expect(() => riskyFunction()).toThrow(TypeError);
expect(() => riskyFunction()).toThrow(/pattern/);
```

### Negating Assertions

Any assertion can be negated with `.not`:

```typescript
expect(value).not.toBe(0);
expect(arr).not.toContain('removed');
expect(() => safeFunction()).not.toThrow();
```

## Testing Reactive State in .svelte.ts Files

Svelte 5 runes like `$state` and `$derived` work in `.svelte.ts` files, and you can test them. But there is a catch: the Svelte compiler must process the test file, which means your test file itself needs the `.svelte.ts` extension, or you test through the module's exported API.

The cleanest approach is to design your reactive modules with getter/setter functions:

```typescript
// src/lib/state/counter.svelte.ts
let count = $state(0);

export function getCount(): number {
  return count;
}

export function increment(): void {
  count++;
}

export function decrement(): void {
  count--;
}

export function reset(): void {
  count = 0;
}
```

```typescript
// src/lib/state/counter.svelte.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getCount, increment, decrement, reset } from './counter.svelte';

describe('counter state', () => {
  beforeEach(() => {
    reset();
  });

  it('starts at zero', () => {
    expect(getCount()).toBe(0);
  });

  it('increments', () => {
    increment();
    increment();
    expect(getCount()).toBe(2);
  });

  it('decrements', () => {
    increment();
    increment();
    decrement();
    expect(getCount()).toBe(1);
  });

  it('does not go below zero after reset', () => {
    increment();
    reset();
    expect(getCount()).toBe(0);
  });
});
```

For more complex reactive state using classes:

```typescript
// src/lib/state/todo-store.svelte.ts
export class TodoStore {
  todos = $state<Array<{ id: string; text: string; done: boolean }>>([]);
  filter = $state<'all' | 'active' | 'completed'>('all');

  filtered = $derived(() => {
    switch (this.filter) {
      case 'active': return this.todos.filter(t => !t.done);
      case 'completed': return this.todos.filter(t => t.done);
      default: return this.todos;
    }
  });

  remaining = $derived(() => this.todos.filter(t => !t.done).length);

  add(text: string): void {
    this.todos.push({ id: crypto.randomUUID(), text, done: false });
  }

  toggle(id: string): void {
    const todo = this.todos.find(t => t.id === id);
    if (todo) todo.done = !todo.done;
  }

  remove(id: string): void {
    this.todos = this.todos.filter(t => t.id !== id);
  }

  clearCompleted(): void {
    this.todos = this.todos.filter(t => !t.done);
  }
}
```

```typescript
// src/lib/state/todo-store.svelte.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TodoStore } from './todo-store.svelte';

describe('TodoStore', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = new TodoStore();
  });

  it('starts with an empty list', () => {
    expect(store.todos).toEqual([]);
    expect(store.remaining).toBe(0);
  });

  it('adds a todo', () => {
    store.add('Buy groceries');
    expect(store.todos).toHaveLength(1);
    expect(store.todos[0].text).toBe('Buy groceries');
    expect(store.todos[0].done).toBe(false);
  });

  it('toggles a todo', () => {
    store.add('Buy groceries');
    const id = store.todos[0].id;

    store.toggle(id);
    expect(store.todos[0].done).toBe(true);

    store.toggle(id);
    expect(store.todos[0].done).toBe(false);
  });

  it('removes a todo', () => {
    store.add('First');
    store.add('Second');
    const firstId = store.todos[0].id;

    store.remove(firstId);
    expect(store.todos).toHaveLength(1);
    expect(store.todos[0].text).toBe('Second');
  });

  it('tracks remaining count', () => {
    store.add('One');
    store.add('Two');
    store.add('Three');
    expect(store.remaining).toBe(3);

    store.toggle(store.todos[0].id);
    expect(store.remaining).toBe(2);
  });

  it('clears completed todos', () => {
    store.add('Keep');
    store.add('Remove');
    store.toggle(store.todos[1].id);

    store.clearCompleted();
    expect(store.todos).toHaveLength(1);
    expect(store.todos[0].text).toBe('Keep');
  });

  it('filters active todos', () => {
    store.add('Active');
    store.add('Done');
    store.toggle(store.todos[1].id);

    store.filter = 'active';
    expect(store.filtered).toHaveLength(1);
    expect(store.filtered[0].text).toBe('Active');
  });

  it('filters completed todos', () => {
    store.add('Active');
    store.add('Done');
    store.toggle(store.todos[1].id);

    store.filter = 'completed';
    expect(store.filtered).toHaveLength(1);
    expect(store.filtered[0].text).toBe('Done');
  });
});
```

The key insight: test state modules through their public API. Never try to read `$state` variables directly from outside — use exported getter functions or class properties.

## Mocking Modules and Dependencies

When the code under test depends on external modules — database clients, API wrappers, SvelteKit modules — you replace them with mocks so your unit tests are fast, deterministic, and isolated.

### vi.mock — Replacing Entire Modules

`vi.mock` replaces a module's exports before any import runs. Vitest hoists `vi.mock` calls to the top of the file automatically:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getUser } from '$lib/server/users';

// This mock is hoisted above the import — it runs first
vi.mock('$lib/server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, name: 'Alice', email: 'alice@example.com' }])
      })
    })
  }
}));

describe('getUser', () => {
  it('returns a user by id', async () => {
    const user = await getUser(1);
    expect(user).toEqual({ id: 1, name: 'Alice', email: 'alice@example.com' });
  });
});
```

### vi.fn — Creating Spy Functions

`vi.fn()` creates a function that records every call:

```typescript
const callback = vi.fn();

callback('hello', 42);
callback('world');

expect(callback).toHaveBeenCalledTimes(2);
expect(callback).toHaveBeenCalledWith('hello', 42);
expect(callback).toHaveBeenLastCalledWith('world');
expect(callback.mock.calls).toEqual([['hello', 42], ['world']]);
```

You can chain return values:

```typescript
const fetchData = vi.fn()
  .mockResolvedValueOnce({ status: 'loading' })
  .mockResolvedValueOnce({ status: 'ok', data: [1, 2, 3] })
  .mockRejectedValueOnce(new Error('Network error'));

await fetchData(); // { status: 'loading' }
await fetchData(); // { status: 'ok', data: [1, 2, 3] }
await fetchData(); // throws Error('Network error')
```

### Mocking fetch

Global `fetch` is one of the most commonly mocked dependencies:

```typescript
// src/lib/api/products.ts
export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch('/api/products');
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }
  return response.json();
}
```

```typescript
// src/lib/api/products.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProducts } from './products';

describe('fetchProducts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns products on success', async () => {
    const mockProducts = [{ id: 1, name: 'Widget', price: 2500 }];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProducts)
    });

    const result = await fetchProducts();
    expect(result).toEqual(mockProducts);
    expect(fetch).toHaveBeenCalledWith('/api/products');
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(fetchProducts()).rejects.toThrow('Failed to fetch products: 500');
  });

  it('throws on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchProducts()).rejects.toThrow('Failed to fetch');
  });
});
```

### Mocking SvelteKit Modules

SvelteKit provides virtual modules like `$app/navigation` and `$app/stores`. Mock them with `vi.mock`:

```typescript
import { vi } from 'vitest';

vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn()
}));

vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false
}));
```

## Mocking Timers

Code that uses `setTimeout`, `setInterval`, or `Date.now()` is notoriously hard to test without fake timers. Vitest provides timer control:

```typescript
// src/lib/utils/debounce.ts
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
```

```typescript
// src/lib/utils/debounce.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays the function call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets the timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(200);

    debounced(); // resets the 300ms timer
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to the original function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('hello', 42);
    vi.runAllTimers();

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });
});
```

`vi.useFakeTimers()` replaces the global timer functions. `vi.advanceTimersByTime(ms)` moves the fake clock forward. `vi.runAllTimers()` executes all pending timers immediately. Always call `vi.useRealTimers()` in `afterEach` to clean up.

## Test Fixtures and Factories

When multiple tests need the same complex objects, create factory functions instead of duplicating setup code:

```typescript
// src/tests/factories.ts
let nextId = 1;

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: nextId++,
    name: 'Test User',
    email: 'test@example.com',
    role: 'member',
    createdAt: new Date('2024-01-01'),
    ...overrides
  };
}

export function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: nextId++,
    name: 'Test Product',
    slug: 'test-product',
    price: 2999,
    stock: 10,
    categoryId: 1,
    ...overrides
  };
}

export function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: nextId++,
    userId: 1,
    items: [{ productId: 1, quantity: 1, price: 2999 }],
    total: 2999,
    status: 'pending',
    createdAt: new Date('2024-01-15'),
    ...overrides
  };
}
```

```typescript
// Usage in tests
import { createUser, createProduct } from '../tests/factories';

it('applies employee discount for staff role', () => {
  const employee = createUser({ role: 'staff' });
  const product = createProduct({ price: 10000 });
  const discountedPrice = calculateDiscount(product, employee);
  expect(discountedPrice).toBe(8000); // 20% employee discount
});
```

Factories keep tests readable — you see only the properties that matter for this specific test. The defaults handle everything else.

## Testing Async Code

Vitest handles Promises and async/await naturally. Use `async` test functions and `await` the assertions:

```typescript
// src/lib/api/auth.ts
export async function login(email: string, password: string): Promise<{ token: string }> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  return response.json();
}
```

```typescript
// src/lib/api/auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { login } from './auth';

describe('login', () => {
  it('returns a token on successful login', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'abc123' })
    });

    const result = await login('alice@example.com', 'password');
    expect(result.token).toBe('abc123');
  });

  it('sends credentials in the request body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'abc123' })
    });

    await login('alice@example.com', 'secret');

    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'secret' })
    });
  });

  it('throws with the server error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Invalid credentials' })
    });

    await expect(login('wrong@example.com', 'bad'))
      .rejects.toThrow('Invalid credentials');
  });

  it('throws a default message when server provides none', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({})
    });

    await expect(login('wrong@example.com', 'bad'))
      .rejects.toThrow('Login failed');
  });
});
```

### Testing Functions That Use Promises Internally

Sometimes you need to test functions that fire-and-forget async operations (e.g., analytics). Use `vi.waitFor` or flush promises manually:

```typescript
import { vi } from 'vitest';

// Flush all pending microtasks
async function flushPromises() {
  await vi.dynamicImportSettled();
}
```

## Code Coverage Configuration

Code coverage tells you which lines, branches, and functions your tests exercise. It is not a quality metric (100% coverage does not mean bug-free code), but it reveals untested areas.

Install the coverage provider:

```bash
npm install -D @vitest/coverage-v8
```

Configure it:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/lib/**/*.svelte.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/**/index.ts',    // barrel files
        'src/lib/types/**'        // type-only files
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      },
      reporter: ['text', 'html', 'lcov']
    }
  }
});
```

Run with:

```bash
npm run test:coverage
```

The `thresholds` option fails the test run if coverage drops below the specified percentages. This prevents coverage from eroding over time. Start with realistic thresholds (70-80%) and raise them as your test suite matures.

The `html` reporter generates an interactive report in `coverage/` that you can browse to see exactly which lines are covered. The `lcov` reporter produces output compatible with CI tools like Codecov and Coveralls.

**Important caveat**: coverage measures what your tests *execute*, not what they *verify*. A test that calls a function but never asserts anything will show the function as "covered." This is why assertions matter more than coverage numbers.

## TDD Workflow

Test-Driven Development (TDD) flips the usual order: you write the test first, watch it fail, then write the minimum code to make it pass. The cycle is Red-Green-Refactor:

1. **Red** — Write a failing test that defines the behavior you want
2. **Green** — Write the simplest code that makes the test pass
3. **Refactor** — Clean up the code while keeping all tests passing

Here is TDD in action for a password validation function:

```typescript
// Step 1 (Red) — Write the test first
// src/lib/utils/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validatePassword } from './validate';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Ab1!xyz')).toEqual({
      valid: false,
      errors: ['Password must be at least 8 characters']
    });
  });
});
```

```typescript
// Step 2 (Green) — Write the minimum code
// src/lib/utils/validate.ts
export function validatePassword(password: string) {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  return { valid: errors.length === 0, errors };
}
```

```typescript
// Step 3 — Add more tests, continue the cycle
it('requires at least one uppercase letter', () => {
  expect(validatePassword('abcdefg1!')).toEqual({
    valid: false,
    errors: ['Password must contain at least one uppercase letter']
  });
});

it('requires at least one number', () => {
  expect(validatePassword('Abcdefgh!')).toEqual({
    valid: false,
    errors: ['Password must contain at least one number']
  });
});

it('accepts a valid password', () => {
  expect(validatePassword('MyP@ssw0rd')).toEqual({
    valid: true,
    errors: []
  });
});

it('returns all errors at once', () => {
  const result = validatePassword('abc');
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThanOrEqual(2);
});
```

TDD works best for functions with clear input/output contracts. It is less practical for UI code, but even there you can TDD the business logic that drives the UI.

## Testing SvelteKit Load Functions

SvelteKit `load` functions are just async functions that receive an event object. You can test them by providing mock event data:

```typescript
// src/routes/products/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
  const category = url.searchParams.get('category');
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = db.select().from('products').limit(limit).offset(offset);
  if (category) {
    query = query.where('category', '=', category);
  }

  const products = await query;
  return { products, page, category };
};
```

```typescript
// src/routes/products/+page.server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { load } from './+page.server';

vi.mock('$lib/server/db', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve([
      { id: 1, name: 'Widget', category: 'tools' }
    ]))
  };

  return { db: mockQuery };
});

function createMockUrl(params: Record<string, string> = {}): URL {
  const url = new URL('http://localhost:5173/products');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

describe('products page load', () => {
  it('returns products with default pagination', async () => {
    const result = await load({ url: createMockUrl() } as any);
    expect(result.page).toBe(1);
    expect(result.products).toHaveLength(1);
  });

  it('passes category filter when provided', async () => {
    const result = await load({ url: createMockUrl({ category: 'tools' }) } as any);
    expect(result.category).toBe('tools');
  });

  it('calculates offset from page number', async () => {
    const result = await load({ url: createMockUrl({ page: '3' }) } as any);
    expect(result.page).toBe(3);
  });
});
```

## Lifecycle Hooks: beforeEach, afterEach, beforeAll, afterAll

Vitest provides setup and teardown hooks that run at specific points in the test lifecycle:

```typescript
import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Runs ONCE before all tests in this file
  // Use for expensive setup: database connections, test servers
});

afterAll(() => {
  // Runs ONCE after all tests in this file
  // Use for cleanup: close connections, remove temp files
});

beforeEach(() => {
  // Runs before EACH test
  // Use for per-test setup: reset state, create fresh mocks
});

afterEach(() => {
  // Runs after EACH test
  // Use for per-test cleanup: clear timers, restore mocks
});
```

The golden rule: **each test must be independent**. `beforeEach` should reset everything so no test depends on another test's side effects.

## Try It

### Exercise 1: Test a Validation Module

Write a `validateEmail(email: string): { valid: boolean; error?: string }` function using TDD. Start with a failing test, make it pass, then add tests for: empty strings, missing `@` symbol, missing domain, multiple `@` symbols, valid email addresses with subdomains. Aim for at least 8 test cases.

### Exercise 2: Test an Async API Client

Create a `fetchUserPosts(userId: number)` function that fetches from `/api/users/{id}/posts`, handles errors, and transforms the response by adding a `readTime` estimate to each post (word count / 200, rounded up, in minutes). Write tests with mocked fetch that cover success, 404, network failure, and the readTime calculation.

### Exercise 3: Test a Reactive Store

Build a `CartStore` class in a `.svelte.ts` file with `addItem`, `removeItem`, `updateQuantity`, and a `total` derived value. Write a complete test suite that verifies all mutations and derived calculations, including edge cases like adding the same item twice (should increase quantity) and removing an item that does not exist (should be a no-op).

## Key Takeaways

- Vitest integrates seamlessly with SvelteKit and Vite, supporting TypeScript and path aliases out of the box
- Structure every test as Arrange-Act-Assert and name tests as behavioral specifications
- Use `describe` to group related tests, `it` to define individual test cases, and `expect` for assertions
- Place test files next to the code they test with a `.test.ts` suffix
- Test reactive `.svelte.ts` modules through their exported API using `.svelte.test.ts` files
- Use `vi.fn()` for spy functions, `vi.mock()` for module replacement, and `vi.useFakeTimers()` for time control
- Use test factories to create consistent test data without duplication
- Configure code coverage with thresholds to prevent coverage erosion, but remember that coverage measures execution, not verification
- Enable `restoreMocks` and `sequence.shuffle` in your Vitest config to catch hidden test dependencies
- TDD (Red-Green-Refactor) is particularly effective for utility functions with clear input/output contracts
- Run `vitest` in watch mode during development for instant feedback on changes
