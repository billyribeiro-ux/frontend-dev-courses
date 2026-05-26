# Component Testing

Unit tests verify your utility functions, but your app is made of **components**. Component testing lets you render a Svelte component in a simulated DOM, interact with it, and assert that the output is correct. This catches bugs that unit tests miss — broken bindings, wrong event handlers, rendering issues, and state management errors that only surface when real DOM elements are involved.

The `@testing-library/svelte` package follows the Testing Library philosophy: test components the way users interact with them. Instead of inspecting internal state or reaching into component internals, you query the DOM by text content, roles, and labels — just like a user would see and use your app. This makes your tests resilient to refactoring. Rename an internal variable, restructure your markup, switch from a `<div>` to a `<section>` — if the user experience stays the same, the tests keep passing.

This philosophy is not just a preference. Tests that couple to implementation details (CSS classes, component hierarchy, internal state names) break every time you refactor, even when the behavior is unchanged. That is worse than having no tests — it teaches developers to distrust the test suite and skip it.

## Setup

Install the testing library and its companion packages:

```bash
npm install -D @testing-library/svelte @testing-library/jest-dom @testing-library/user-event jsdom
```

Each package has a specific role:

- **@testing-library/svelte** — Renders Svelte components and provides DOM query functions
- **@testing-library/jest-dom** — Adds DOM-specific matchers like `toBeInTheDocument()` and `toBeVisible()`
- **@testing-library/user-event** — Simulates user interactions more realistically than `fireEvent`
- **jsdom** — A JavaScript implementation of the DOM that runs in Node.js (no real browser needed)

Configure Vitest to use jsdom in your `vite.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    restoreMocks: true,
    css: false  // Skip CSS processing for faster tests
  }
});
```

Create the setup file that extends Vitest matchers with DOM assertions:

```typescript
// src/tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

This single import makes matchers like `toBeInTheDocument()`, `toHaveTextContent()`, `toBeVisible()`, `toBeDisabled()`, and dozens of others available in every test file.

### Why jsdom and Not happy-dom?

Vitest supports two DOM environments: `jsdom` and `happy-dom`. `happy-dom` is faster but less complete — it skips some DOM APIs that complex components rely on. Start with `jsdom` for maximum compatibility. If your test suite grows large and speed becomes a concern, try switching to `happy-dom` and see if your tests still pass.

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

The `render` function returns an object with query functions bound to the rendered component's container. But using the `screen` object (imported from `@testing-library/svelte`) is preferred — it queries the entire document, which is how users experience your app.

### render Options

The `render` function accepts configuration beyond just props:

```typescript
// Pass props
render(MyComponent, { props: { count: 5, label: 'Items' } });

// Pass props directly (shorthand when only props are needed)
render(MyComponent, { count: 5, label: 'Items' });

// Specify a custom container
const container = document.createElement('section');
render(MyComponent, { props: { name: 'Alice' }, target: container });
```

### Cleanup Between Tests

`@testing-library/svelte` automatically cleans up rendered components after each test when using Vitest. The component is unmounted and the DOM is reset. You do not need to call `cleanup()` manually.

However, if you render multiple components in a single test, only the last one is auto-cleaned. For complex multi-component scenarios, use the returned `unmount` function:

```typescript
it('coordinates between two components', () => {
  const { unmount: unmountA } = render(ComponentA);
  // ... test something
  unmountA();

  render(ComponentB);
  // ... test something else
});
```

## Querying the DOM: The Full Query API

Testing Library provides three categories of queries, each with distinct behavior:

### getBy — Element Must Exist

`getBy` throws an error if the element is not found or if multiple elements match. Use it when the element should definitely be in the DOM:

```typescript
screen.getByRole('button', { name: 'Submit' });    // By ARIA role
screen.getByRole('heading', { level: 1 });          // Heading with level
screen.getByLabelText('Email');                      // Form field by label
screen.getByPlaceholderText('Search...');            // By placeholder
screen.getByText('Welcome back');                    // By text content
screen.getByDisplayValue('current input value');     // By current value
screen.getByAltText('User avatar');                  // By alt text
screen.getByTitle('Close dialog');                   // By title attribute
screen.getByTestId('custom-element');                // By data-testid
```

### queryBy — Element Might Not Exist

`queryBy` returns `null` instead of throwing when the element is not found. Use it to assert that something is absent:

```typescript
expect(screen.queryByText('Error')).not.toBeInTheDocument();
expect(screen.queryByRole('alert')).toBeNull();
```

### findBy — Element Will Appear Asynchronously

`findBy` returns a Promise that resolves when the element appears (polling the DOM). It times out after 1000ms by default. Use it for elements that render after an async operation:

```typescript
const alert = await screen.findByRole('alert');
expect(alert).toHaveTextContent('Saved successfully');

// With custom timeout
const slowElement = await screen.findByText('Loaded', {}, { timeout: 3000 });
```

### getAllBy, queryAllBy, findAllBy

Each query type also has a plural form that returns an array:

```typescript
const buttons = screen.getAllByRole('button');
expect(buttons).toHaveLength(3);

const listItems = screen.getAllByRole('listitem');
expect(listItems).toHaveLength(5);
```

### Query Priority

Testing Library recommends this priority order, from most preferred to last resort:

1. **getByRole** — Queries the accessibility tree. This is the best default because it tests what screen readers see. Most HTML elements have implicit roles: `<button>` is `button`, `<a href>` is `link`, `<input type="checkbox">` is `checkbox`.

2. **getByLabelText** — Best for form fields. Verifies that the label-input association works.

3. **getByPlaceholderText** — Use when there is no visible label (though you should usually have one).

4. **getByText** — Good for non-interactive elements like headings and paragraphs.

5. **getByDisplayValue** — For inputs that already have a value.

6. **getByAltText** — For images.

7. **getByTitle** — For elements with title attributes.

8. **getByTestId** — Last resort. Use `data-testid` when none of the above work. This does not test accessibility.

```typescript
// Preferred: tests accessibility
screen.getByRole('button', { name: 'Add to cart' });

// Acceptable: tests label association
screen.getByLabelText('Quantity');

// Last resort: does not test anything about accessibility
screen.getByTestId('add-to-cart-button');
```

## User Interactions with user-event

Testing Library provides two ways to simulate interactions: `fireEvent` (low-level) and `userEvent` (high-level). Prefer `userEvent` because it simulates real user behavior more accurately.

When a real user clicks a button, the browser fires `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`, and `focus` events in sequence. `fireEvent.click()` fires only the `click` event. `userEvent.click()` fires the full sequence — catching bugs that only appear when the full event chain runs.

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('increments when clicked', async () => {
    const user = userEvent.setup();
    render(Counter);

    const button = screen.getByRole('button', { name: 'Increment' });
    await user.click(button);

    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### Common user-event Actions

```typescript
const user = userEvent.setup();

// Click
await user.click(element);
await user.dblClick(element);
await user.tripleClick(element);  // Selects entire line of text

// Keyboard
await user.type(input, 'Hello World');    // Types character by character
await user.clear(input);                   // Clears the input
await user.keyboard('{Enter}');            // Press Enter
await user.keyboard('{Shift>}A{/Shift}');  // Shift+A (uppercase)
await user.tab();                          // Tab to next focusable element

// Pointer
await user.hover(element);
await user.unhover(element);

// Clipboard
await user.copy();
await user.paste('pasted text');

// Select
await user.selectOptions(selectElement, ['option1', 'option2']);
await user.deselectOptions(selectElement, ['option1']);
```

### Typing vs Setting Values

There is an important distinction between `user.type()` and `fireEvent.input()`:

```typescript
// user.type fires keydown, keypress, input, keyup for EACH character
// This tests keyboard event handlers, input validation, etc.
await user.type(input, 'test@example.com');

// fireEvent.input sets the value in one shot
// Faster but skips per-keystroke behavior
await fireEvent.input(input, { target: { value: 'test@example.com' } });
```

Use `user.type()` when testing real-time validation, character limits, or input masking. Use `fireEvent.input()` when you just need a value set quickly and keystroke behavior does not matter.

## Testing Reactive State Changes

Svelte 5 components use `$state` for reactivity. When state changes, the DOM updates asynchronously (via microtasks). Testing Library handles this automatically for `fireEvent` and `userEvent`, but you sometimes need to wait explicitly:

```svelte
<!-- src/lib/components/Counter.svelte -->
<script lang="ts">
  let count = $state(0);

  function increment() {
    count++;
  }

  function reset() {
    count = 0;
  }
</script>

<p data-testid="count">Count: {count}</p>
<button onclick={increment}>Increment</button>
<button onclick={reset}>Reset</button>
```

```typescript
// src/lib/components/Counter.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('starts at zero', () => {
    render(Counter);
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });

  it('increments when the button is clicked', async () => {
    const user = userEvent.setup();
    render(Counter);

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });

  it('increments multiple times', async () => {
    const user = userEvent.setup();
    render(Counter);

    const button = screen.getByRole('button', { name: 'Increment' });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(screen.getByText('Count: 3')).toBeInTheDocument();
  });

  it('resets back to zero', async () => {
    const user = userEvent.setup();
    render(Counter);

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    await user.click(screen.getByRole('button', { name: 'Increment' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });
});
```

## Testing Event Handlers (Callback Props)

Components often accept callback functions as props. Test that they are called with the right arguments:

```svelte
<!-- src/lib/components/SearchInput.svelte -->
<script lang="ts">
  let {
    placeholder = 'Search...',
    onsearch
  }: {
    placeholder?: string;
    onsearch: (query: string) => void;
  } = $props();

  let query = $state('');

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (query.trim()) {
      onsearch(query.trim());
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <label>
    Search
    <input type="text" bind:value={query} {placeholder} />
  </label>
  <button type="submit">Search</button>
</form>
```

```typescript
// src/lib/components/SearchInput.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SearchInput from './SearchInput.svelte';

describe('SearchInput', () => {
  it('calls onsearch with the trimmed query when submitted', async () => {
    const user = userEvent.setup();
    const onsearch = vi.fn();

    render(SearchInput, { props: { onsearch } });

    await user.type(screen.getByLabelText('Search'), '  svelte 5  ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onsearch).toHaveBeenCalledOnce();
    expect(onsearch).toHaveBeenCalledWith('svelte 5');
  });

  it('does not call onsearch when the query is empty', async () => {
    const user = userEvent.setup();
    const onsearch = vi.fn();

    render(SearchInput, { props: { onsearch } });

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onsearch).not.toHaveBeenCalled();
  });

  it('does not call onsearch when the query is only whitespace', async () => {
    const user = userEvent.setup();
    const onsearch = vi.fn();

    render(SearchInput, { props: { onsearch } });

    await user.type(screen.getByLabelText('Search'), '   ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onsearch).not.toHaveBeenCalled();
  });

  it('uses the custom placeholder', () => {
    const onsearch = vi.fn();
    render(SearchInput, { props: { onsearch, placeholder: 'Find products...' } });

    expect(screen.getByPlaceholderText('Find products...')).toBeInTheDocument();
  });
});
```

## Testing Forms Thoroughly

Forms are the most interaction-heavy part of most web apps. Test the full flow — input, validation, submission, error display, and success states:

```svelte
<!-- src/lib/components/ContactForm.svelte -->
<script lang="ts">
  let name = $state('');
  let email = $state('');
  let message = $state('');
  let errors = $state<Record<string, string>>({});
  let submitted = $state(false);

  function validate(): boolean {
    errors = {};
    if (!name.trim()) errors.name = 'Name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!email.includes('@')) errors.email = 'Invalid email address';
    if (!message.trim()) errors.message = 'Message is required';
    else if (message.trim().length < 10) errors.message = 'Message must be at least 10 characters';
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (validate()) {
      submitted = true;
    }
  }
</script>

{#if submitted}
  <div role="alert">
    <p>Thank you, {name}! Your message has been sent.</p>
  </div>
{:else}
  <form onsubmit={handleSubmit} novalidate>
    <div>
      <label for="name">Name</label>
      <input id="name" type="text" bind:value={name} aria-describedby={errors.name ? 'name-error' : undefined} />
      {#if errors.name}
        <p id="name-error" class="error" role="alert">{errors.name}</p>
      {/if}
    </div>

    <div>
      <label for="email">Email</label>
      <input id="email" type="email" bind:value={email} aria-describedby={errors.email ? 'email-error' : undefined} />
      {#if errors.email}
        <p id="email-error" class="error" role="alert">{errors.email}</p>
      {/if}
    </div>

    <div>
      <label for="message">Message</label>
      <textarea id="message" bind:value={message} aria-describedby={errors.message ? 'message-error' : undefined}></textarea>
      {#if errors.message}
        <p id="message-error" class="error" role="alert">{errors.message}</p>
      {/if}
    </div>

    <button type="submit">Send Message</button>
  </form>
{/if}
```

```typescript
// src/lib/components/ContactForm.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ContactForm from './ContactForm.svelte';

describe('ContactForm', () => {
  it('renders all form fields', () => {
    render(ContactForm);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Message' })).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Message is required')).toBeInTheDocument();
  });

  it('shows email format error', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    await user.type(screen.getByLabelText('Email'), 'invalid-email');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('shows message length error', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    await user.type(screen.getByLabelText('Message'), 'Short');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(screen.getByText('Message must be at least 10 characters')).toBeInTheDocument();
  });

  it('submits successfully with valid data', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    await user.type(screen.getByLabelText('Name'), 'Alice Johnson');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Message'), 'This is a test message with enough characters.');

    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Thank you, Alice Johnson! Your message has been sent.'
    );
    expect(screen.queryByRole('button', { name: 'Send Message' })).not.toBeInTheDocument();
  });

  it('clears previous errors when resubmitting', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    // Submit empty to trigger errors
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();

    // Fill in name and resubmit
    await user.type(screen.getByLabelText('Name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    // Name error should be gone, others remain
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
  });

  it('associates error messages with inputs via aria-describedby', async () => {
    const user = userEvent.setup();
    render(ContactForm);

    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
  });
});
```

## Testing Components with Conditional Rendering

Components that show different UI based on state are common. Test each branch:

```svelte
<!-- src/lib/components/StatusBadge.svelte -->
<script lang="ts">
  let { status }: { status: 'loading' | 'success' | 'error'; message?: string } = $props();
</script>

{#if status === 'loading'}
  <div role="status" aria-label="Loading">
    <span class="spinner" aria-hidden="true"></span>
    Loading...
  </div>
{:else if status === 'success'}
  <div role="status" class="success">
    Operation completed successfully
  </div>
{:else if status === 'error'}
  <div role="alert" class="error">
    Something went wrong. Please try again.
  </div>
{/if}
```

```typescript
// src/lib/components/StatusBadge.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatusBadge from './StatusBadge.svelte';

describe('StatusBadge', () => {
  it('shows a loading indicator with accessible role', () => {
    render(StatusBadge, { props: { status: 'loading' } });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading...');
    expect(status).toHaveAttribute('aria-label', 'Loading');
  });

  it('shows success message', () => {
    render(StatusBadge, { props: { status: 'success' } });

    expect(screen.getByRole('status')).toHaveTextContent('Operation completed successfully');
  });

  it('shows error as an alert', () => {
    render(StatusBadge, { props: { status: 'error' } });

    // role="alert" is used for errors so screen readers announce immediately
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('does not show success content when loading', () => {
    render(StatusBadge, { props: { status: 'loading' } });

    expect(screen.queryByText('Operation completed successfully')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

## Testing Components with Async Data

Components that fetch data or display async content need special handling:

```svelte
<!-- src/lib/components/UserProfile.svelte -->
<script lang="ts">
  let { userId }: { userId: number } = $props();
  let user = $state<{ name: string; email: string } | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  $effect(() => {
    loading = true;
    error = null;

    fetch(`/api/users/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error('User not found');
        return res.json();
      })
      .then(data => {
        user = data;
        loading = false;
      })
      .catch(err => {
        error = err.message;
        loading = false;
      });
  });
</script>

{#if loading}
  <div role="status" aria-label="Loading user profile">Loading...</div>
{:else if error}
  <div role="alert">{error}</div>
{:else if user}
  <div>
    <h2>{user.name}</h2>
    <p>{user.email}</p>
  </div>
{/if}
```

```typescript
// src/lib/components/UserProfile.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import UserProfile from './UserProfile.svelte';

describe('UserProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(UserProfile, { props: { userId: 1 } });

    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  });

  it('displays user data after loading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: 'Alice', email: 'alice@example.com' })
    });

    render(UserProfile, { props: { userId: 1 } });

    // findBy waits for the element to appear
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    render(UserProfile, { props: { userId: 999 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
  });

  it('shows error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    render(UserProfile, { props: { userId: 1 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  });
});
```

The key pattern here is using `findBy` queries. When a component renders asynchronously, `getBy` queries run immediately and fail because the content is not yet in the DOM. `findBy` queries poll the DOM until the element appears (or the timeout expires), making them perfect for async components.

## Testing Components with Context

Svelte's `setContext` / `getContext` creates a problem for testing: context is set by a parent component and read by a child. You cannot just render the child in isolation.

The solution is to create a test wrapper component:

```svelte
<!-- src/lib/components/ThemeToggle.svelte -->
<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{ current: string; toggle: () => void }>('theme');
</script>

<button onclick={theme.toggle}>
  Current theme: {theme.current}
</button>
```

```svelte
<!-- src/tests/ThemeWrapper.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let { theme, toggle, children }: {
    theme: string;
    toggle: () => void;
    children: any;
  } = $props();

  setContext('theme', { current: theme, toggle });
</script>

{@render children()}
```

```typescript
// src/lib/components/ThemeToggle.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ThemeWrapper from '../../tests/ThemeWrapper.svelte';
import ThemeToggle from './ThemeToggle.svelte';

describe('ThemeToggle', () => {
  it('displays the current theme', () => {
    render(ThemeWrapper, {
      props: {
        theme: 'dark',
        toggle: vi.fn(),
        children: createRawSnippet(() => ({
          render: () => `<div></div>`,
          setup: (node) => {
            new ThemeToggle({ target: node });
          }
        }))
      }
    });

    expect(screen.getByRole('button')).toHaveTextContent('Current theme: dark');
  });
});
```

An easier pattern is to design your context-using components so that they accept fallback props. If the context value is missing, use the prop instead. This makes testing straightforward:

```svelte
<!-- Design for testability -->
<script lang="ts">
  import { getContext } from 'svelte';

  let {
    theme = getContext<string>('theme') ?? 'light'
  }: { theme?: string } = $props();
</script>
```

Now you can test without a wrapper by passing the `theme` prop directly.

## Testing Lists and Iteration

Components that render lists with `{#each}` need tests for empty states, single items, and multiple items:

```svelte
<!-- src/lib/components/ProductList.svelte -->
<script lang="ts">
  type Product = { id: number; name: string; price: number; inStock: boolean };
  let { products }: { products: Product[] } = $props();
</script>

{#if products.length === 0}
  <p>No products found.</p>
{:else}
  <ul role="list" aria-label="Products">
    {#each products as product (product.id)}
      <li>
        <span>{product.name}</span>
        <span>${(product.price / 100).toFixed(2)}</span>
        {#if !product.inStock}
          <span class="out-of-stock">Out of stock</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
```

```typescript
// src/lib/components/ProductList.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProductList from './ProductList.svelte';

describe('ProductList', () => {
  it('shows empty state when no products', () => {
    render(ProductList, { props: { products: [] } });

    expect(screen.getByText('No products found.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders all products', () => {
    const products = [
      { id: 1, name: 'Widget', price: 999, inStock: true },
      { id: 2, name: 'Gadget', price: 2499, inStock: true },
      { id: 3, name: 'Doohickey', price: 1599, inStock: false }
    ];

    render(ProductList, { props: { products } });

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('formats prices correctly', () => {
    const products = [
      { id: 1, name: 'Widget', price: 999, inStock: true }
    ];

    render(ProductList, { props: { products } });

    expect(screen.getByText('$9.99')).toBeInTheDocument();
  });

  it('shows out-of-stock indicator', () => {
    const products = [
      { id: 1, name: 'Widget', price: 999, inStock: false }
    ];

    render(ProductList, { props: { products } });

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('does not show out-of-stock for available products', () => {
    const products = [
      { id: 1, name: 'Widget', price: 999, inStock: true }
    ];

    render(ProductList, { props: { products } });

    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
  });

  it('has an accessible list label', () => {
    const products = [
      { id: 1, name: 'Widget', price: 999, inStock: true }
    ];

    render(ProductList, { props: { products } });

    expect(screen.getByRole('list', { name: 'Products' })).toBeInTheDocument();
  });
});
```

## Snapshot Testing: When and When Not

Snapshot tests capture the rendered output and compare it to a stored reference. They are good for detecting unintended changes, but bad as a primary testing strategy:

```typescript
import { render } from '@testing-library/svelte';
import Badge from './Badge.svelte';

it('matches snapshot', () => {
  const { container } = render(Badge, { props: { label: 'New', variant: 'success' } });
  expect(container.innerHTML).toMatchSnapshot();
});
```

**When snapshots help**: catching unintended markup changes in stable, presentational components.

**When snapshots hurt**: they become "approval tests" where developers blindly update snapshots without reading them. Large snapshots are unreadable in code review. They break on any markup change, even intentional ones.

The recommendation: use behavioral tests (checking text, roles, attributes) as your primary strategy. Use snapshots sparingly for small, stable, presentational components. Never use snapshots as a substitute for understanding what the component should do.

## Testing Accessibility in Components

Every component test should include basic accessibility checks:

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/svelte';

expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const { container } = render(MyComponent, { props: { /* ... */ } });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Install with `npm install -D jest-axe`. This catches missing labels, invalid ARIA, insufficient contrast (in some cases), and heading order issues automatically.

## Complete Test Suite: A Real-World Example

Here is a complete test file for a notification toast component — the kind of test suite you would write in production:

```svelte
<!-- src/lib/components/Toast.svelte -->
<script lang="ts">
  let {
    message,
    type = 'info',
    dismissible = true,
    duration = 5000,
    ondismiss
  }: {
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
    duration?: number;
    ondismiss?: () => void;
  } = $props();

  let visible = $state(true);

  $effect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        visible = false;
        ondismiss?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  });

  function dismiss() {
    visible = false;
    ondismiss?.();
  }
</script>

{#if visible}
  <div
    role={type === 'error' ? 'alert' : 'status'}
    class="toast toast-{type}"
    aria-live={type === 'error' ? 'assertive' : 'polite'}
  >
    <p>{message}</p>
    {#if dismissible}
      <button onclick={dismiss} aria-label="Dismiss notification">
        &times;
      </button>
    {/if}
  </div>
{/if}
```

```typescript
// src/lib/components/Toast.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Toast from './Toast.svelte';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Rendering ---

  it('displays the message', () => {
    render(Toast, { props: { message: 'Changes saved' } });
    expect(screen.getByText('Changes saved')).toBeInTheDocument();
  });

  it('uses status role for info toasts', () => {
    render(Toast, { props: { message: 'Info', type: 'info' } });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses alert role for error toasts', () => {
    render(Toast, { props: { message: 'Error', type: 'error' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('uses assertive aria-live for errors', () => {
    render(Toast, { props: { message: 'Error', type: 'error' } });
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('uses polite aria-live for non-errors', () => {
    render(Toast, { props: { message: 'Saved', type: 'success' } });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  // --- Dismiss button ---

  it('shows a dismiss button when dismissible', () => {
    render(Toast, { props: { message: 'Test', dismissible: true } });
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
  });

  it('hides the dismiss button when not dismissible', () => {
    render(Toast, { props: { message: 'Test', dismissible: false } });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removes the toast when dismiss is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(Toast, { props: { message: 'Test', duration: 0 } });

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('calls ondismiss when dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const ondismiss = vi.fn();
    render(Toast, { props: { message: 'Test', ondismiss, duration: 0 } });

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(ondismiss).toHaveBeenCalledOnce();
  });

  // --- Auto-dismiss ---

  it('auto-dismisses after the duration', async () => {
    render(Toast, { props: { message: 'Temporary', duration: 3000 } });
    expect(screen.getByText('Temporary')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000);

    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss when duration is 0', async () => {
    render(Toast, { props: { message: 'Permanent', duration: 0 } });

    await vi.advanceTimersByTimeAsync(10000);

    expect(screen.getByText('Permanent')).toBeInTheDocument();
  });

  it('calls ondismiss when auto-dismissed', async () => {
    const ondismiss = vi.fn();
    render(Toast, { props: { message: 'Test', ondismiss, duration: 2000 } });

    await vi.advanceTimersByTimeAsync(2000);

    expect(ondismiss).toHaveBeenCalledOnce();
  });
});
```

This test suite covers rendering, ARIA semantics, user interactions, auto-dismiss timing, callback behavior, and edge cases. Notice how every test targets a specific behavior and uses accessible queries.

## Try It

### Exercise 1: Test a TodoItem Component

Create a `TodoItem` component that displays a task with a checkbox, text label, and a delete button. The checkbox toggles a `done` state (shown via line-through styling), and the delete button calls an `ondelete` callback. Write a full test suite that covers: initial render with unchecked state, toggling the checkbox, displaying the line-through class, the delete button calling the callback, and an accessibility check (the checkbox must have a label).

### Exercise 2: Test a Modal Dialog

Create a `ConfirmDialog` component that uses `<dialog>` with a title, message, and Confirm/Cancel buttons. Test that: the dialog can be opened and closed, the Confirm button calls an `onconfirm` callback, the Cancel button calls `oncancel`, the dialog has the correct ARIA attributes, and focus is managed correctly (initial focus goes to the Cancel button for safety).

### Exercise 3: Test a Data Table

Build a `DataTable` component that accepts `columns` (array of header names) and `rows` (array of arrays). Write tests for: rendering headers, rendering rows, empty state display, correct number of cells, and keyboard accessibility of the table.

## Key Takeaways

- `@testing-library/svelte` lets you render components and test them the way users interact with them
- Query elements by role, label, or text — avoid querying by CSS class or internal structure
- Use `userEvent` over `fireEvent` for realistic interaction simulation (full event sequences)
- Use `getBy` when the element must exist, `queryBy` when it might not, `findBy` for async elements
- Test event handler props with `vi.fn()` and verify they are called with the correct arguments
- Test forms end-to-end: input, validation errors, submission, and success states
- For context-dependent components, create test wrappers or design components with prop fallbacks
- Snapshot testing is a supplement, not a substitute, for behavioral tests
- Every component test suite should verify basic accessibility (roles, labels, ARIA attributes)
- Component tests catch integration issues that unit tests miss — broken props, event handlers, conditional rendering, and state synchronization
