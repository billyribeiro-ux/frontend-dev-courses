# Unit Testing with Vitest

Writing code that works today is one thing. Writing code that still works after you refactor, add features, and fix bugs is another. **Tests** are your safety net — they verify that your code does what you expect, and they catch regressions before your users do.

Vitest is the testing framework built for the Vite ecosystem, which means it works perfectly with SvelteKit out of the box. It is fast, has a familiar API (almost identical to Jest), and supports TypeScript without extra configuration.

## Setting Up Vitest

SvelteKit projects created with `create-svelte` include Vitest by default. If you need to add it manually:

```bash
npm install -D vitest
```

Add a test script to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Vitest reads your `vite.config.ts` automatically, so path aliases like `$lib` just work.

## Writing Your First Test

Create a utility function and a test file:

```typescript
// src/lib/utils/math.ts
export function add(a: number, b: number): number {
  return a + b;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

```typescript
// src/lib/utils/math.test.ts
import { describe, it, expect } from 'vitest';
import { add, clamp } from './math';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('handles negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
});

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
```

Run tests with:

```bash
npm run test
```

## Assertions

Vitest provides many assertion methods through `expect`:

```typescript
// Equality
expect(value).toBe(5);             // Strict equality (===)
expect(obj).toEqual({ a: 1 });     // Deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThanOrEqual(10);
expect(0.1 + 0.2).toBeCloseTo(0.3);

// Strings
expect(str).toContain('hello');
expect(str).toMatch(/pattern/);

// Arrays
expect(arr).toContain('item');
expect(arr).toHaveLength(3);

// Exceptions
expect(() => riskyFunction()).toThrow();
expect(() => riskyFunction()).toThrow('specific message');
```

## Mocking

Replace real implementations with controlled test doubles:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock a module
vi.mock('$lib/server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }])
    })
  }
}));

// Mock a function
const fetchData = vi.fn().mockResolvedValue({ status: 'ok' });

describe('with mocked fetch', () => {
  it('calls the API', async () => {
    const result = await fetchData();
    expect(fetchData).toHaveBeenCalledOnce();
    expect(result.status).toBe('ok');
  });
});
```

## Testing Async Code

Vitest handles Promises and async/await naturally:

```typescript
import { describe, it, expect } from 'vitest';

async function fetchUser(id: number) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('User not found');
  return res.json();
}

describe('fetchUser', () => {
  it('rejects for missing users', async () => {
    await expect(fetchUser(999)).rejects.toThrow('User not found');
  });
});
```

## Try It

Write tests for a `formatCurrency(cents: number)` function that converts cents to a dollar string (e.g., `1299` becomes `"$12.99"`). Cover edge cases: zero, negative values, and single-digit cent values like `5` becoming `"$0.05"`.

## Key Takeaways

- Vitest integrates seamlessly with SvelteKit and Vite, supporting TypeScript and path aliases out of the box
- Use `describe` to group related tests, `it` to define individual test cases, and `expect` for assertions
- Place test files next to the code they test with a `.test.ts` suffix
- Use `vi.fn()` and `vi.mock()` to replace dependencies with controlled test doubles
- Run `vitest` in watch mode during development for instant feedback on changes
