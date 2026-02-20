# Component Testing

Unit tests verify your utility functions, but your app is made of **components**. Component testing lets you render a Svelte component in a simulated DOM, interact with it, and assert that the output is correct. This catches bugs that unit tests miss — broken bindings, wrong event handlers, and rendering issues.

The `@testing-library/svelte` package follows the Testing Library philosophy: test components the way users interact with them. Instead of inspecting internal state, you query the DOM by text content, roles, and labels — just like a user would see and use your app.

## Setup

Install the testing library:

```bash
npm install -D @testing-library/svelte @testing-library/jest-dom jsdom
```

Configure Vitest to use jsdom in your `vite.config.ts`:

```typescript
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

## Rendering Components

Use `render` to mount a component and get query functions:

```svelte
<!-- src/lib/components/Greeting.svelte -->
<script lang="ts">
  let { name = 'World' }: { name?: string } = $props();
</script>

<h1>Hello, {name}!</h1>
```

```typescript
// src/lib/components/Greeting.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Greeting from './Greeting.svelte';

describe('Greeting', () => {
  it('renders with default name', () => {
    render(Greeting);
    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
  });

  it('renders with a custom name', () => {
    render(Greeting, { props: { name: 'Alice' } });
    expect(screen.getByText('Hello, Alice!')).toBeInTheDocument();
  });
});
```

## Querying the DOM

Testing Library provides several query methods, ordered by priority:

```typescript
// By role (preferred — matches how screen readers see the page)
screen.getByRole('button', { name: 'Submit' });
screen.getByRole('heading', { level: 1 });

// By label (great for form fields)
screen.getByLabelText('Email');

// By placeholder
screen.getByPlaceholderText('Search...');

// By text content
screen.getByText('Welcome back');

// By test ID (last resort)
screen.getByTestId('custom-element');
```

Use `queryBy` instead of `getBy` when you expect the element to not exist:

```typescript
expect(screen.queryByText('Error')).not.toBeInTheDocument();
```

## Simulating User Events

Use `@testing-library/user-event` or the built-in `fireEvent`:

```svelte
<!-- src/lib/components/Counter.svelte -->
<script lang="ts">
  let count = $state(0);
</script>

<p>Count: {count}</p>
<button onclick={() => count++}>Increment</button>
```

```typescript
// src/lib/components/Counter.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('starts at zero', () => {
    render(Counter);
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });

  it('increments when clicked', async () => {
    render(Counter);

    const button = screen.getByRole('button', { name: 'Increment' });
    await fireEvent.click(button);

    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });

  it('increments multiple times', async () => {
    render(Counter);

    const button = screen.getByRole('button', { name: 'Increment' });
    await fireEvent.click(button);
    await fireEvent.click(button);
    await fireEvent.click(button);

    expect(screen.getByText('Count: 3')).toBeInTheDocument();
  });
});
```

## Testing Forms

Test that form inputs and submissions work correctly:

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import LoginForm from './LoginForm.svelte';

it('submits the form with entered values', async () => {
  render(LoginForm);

  const emailInput = screen.getByLabelText('Email');
  const passwordInput = screen.getByLabelText('Password');

  await fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
  await fireEvent.input(passwordInput, { target: { value: 'secret123' } });

  const submitButton = screen.getByRole('button', { name: 'Log In' });
  await fireEvent.click(submitButton);

  expect(screen.getByText('Welcome, test@example.com')).toBeInTheDocument();
});
```

## Try It

Create a `TodoItem` component that displays a task with a checkbox and a delete button. Write tests that verify: the task text is displayed, clicking the checkbox toggles a "completed" class, and clicking delete removes the item from the DOM.

## Key Takeaways

- `@testing-library/svelte` lets you render components and test them like a user would
- Query elements by role, label, or text — avoid querying by CSS class or internal structure
- Use `fireEvent` to simulate clicks, inputs, and other user interactions
- Use `getBy` when the element must exist, `queryBy` when it might not
- Component tests catch integration issues that unit tests miss, like broken props and event handlers
