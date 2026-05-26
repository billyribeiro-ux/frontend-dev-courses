# E2E Testing with Playwright

Unit tests verify functions. Component tests verify UI pieces. But neither tells you if the whole app works when a user clicks through it from start to finish. **End-to-end (E2E) tests** automate a real browser to test your complete application — loading pages, filling out forms, clicking buttons, and verifying the results. They test the full stack: your SvelteKit frontend, your server-side load functions, your API routes, your database queries, your authentication flow, and every integration point between them.

E2E tests are the most expensive tests to write and maintain, but they provide confidence that nothing else can. A passing E2E test means a real user can complete that workflow in a real browser. No mocks, no simulations, no shortcuts.

Playwright is a modern E2E testing tool from Microsoft that controls Chromium, Firefox, and WebKit browsers. It is fast (runs tests in parallel by default), reliable (auto-waits for elements instead of using arbitrary sleeps), and included as an option when you scaffold a SvelteKit project.

## Setting Up Playwright in SvelteKit

If you did not add Playwright during project creation, install it manually:

```bash
npm install -D @playwright/test
npx playwright install
```

The `playwright install` command downloads the browser binaries. This is a one-time setup per machine (roughly 400MB for all three browsers).

Create a configuration file:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.test.ts',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI (flaky test mitigation)
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI to avoid resource contention
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: process.env.CI ? 'html' : 'list',

  // Shared settings for all projects
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',         // Capture trace on retry for debugging
    screenshot: 'only-on-failure',    // Screenshot failed tests
    video: 'retain-on-failure'        // Record video only for failures
  },

  // Configure the dev server
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  },

  // Test against multiple browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});
```

This configuration is production-ready. Let me explain the key decisions:

- **`fullyParallel: true`** — Runs tests in parallel for speed. Each test gets its own browser context (isolated cookies, storage, etc.), so they do not interfere with each other.
- **`forbidOnly`** — Prevents accidentally committing `test.only()` which would skip all other tests in CI.
- **`retries`** — E2E tests can be flaky due to timing, network, or rendering issues. Retrying on CI catches transient failures without masking real bugs.
- **`trace: 'on-first-retry'`** — Captures a full trace (DOM snapshots, network requests, console logs) when a test is retried. This is invaluable for debugging CI failures.
- **`reuseExistingServer`** — In development, if you already have a dev server running, Playwright uses it instead of starting a new one.

Run tests:

```bash
npx playwright test                  # Run all tests
npx playwright test --project=chromium  # Run in Chromium only
npx playwright test e2e/auth.test.ts  # Run a specific file
npx playwright test --ui              # Interactive UI mode
npx playwright show-report            # View the HTML report
```

## Writing Your First E2E Test

Create a test file in the `e2e` directory:

```typescript
// e2e/home.test.ts
import { test, expect } from '@playwright/test';

test('home page has correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/My App/);
});

test('navigation links work', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Us');
});
```

Notice that Playwright assertions use `await expect(...)` — they auto-wait for up to 5 seconds (configurable) for the condition to be true. This eliminates the most common source of flaky E2E tests: hardcoded `sleep()` calls.

## Locators: Finding Elements Reliably

Playwright provides role-based locators that mirror Testing Library's philosophy:

```typescript
// By role (preferred — accessible and resilient)
page.getByRole('button', { name: 'Submit' });
page.getByRole('heading', { level: 1 });
page.getByRole('link', { name: 'Sign Up' });
page.getByRole('checkbox', { name: 'Accept terms' });
page.getByRole('textbox', { name: 'Email' });

// By label (great for form fields)
page.getByLabel('Email');
page.getByLabel('Password');

// By placeholder
page.getByPlaceholder('Search products...');

// By text content
page.getByText('Welcome back');
page.getByText('Welcome', { exact: false }); // partial match

// By alt text (images)
page.getByAltText('Company logo');

// By test ID (last resort — not accessible)
page.getByTestId('product-card');

// CSS selectors (avoid when possible)
page.locator('.product-card');
page.locator('#main-content');
page.locator('article >> h2');
```

### Locator Chaining and Filtering

Locators can be narrowed with filters:

```typescript
// Find a specific product card
const productCard = page.getByRole('article').filter({
  hasText: 'Premium Widget'
});

// Find a button inside a specific section
const addButton = productCard.getByRole('button', { name: 'Add to cart' });

// Nth element
const firstItem = page.getByRole('listitem').nth(0);
const lastItem = page.getByRole('listitem').last();
```

## Page Objects Pattern

As your test suite grows, you will find yourself repeating the same selectors and interactions across many tests. The Page Object pattern encapsulates page-specific logic into reusable classes:

```typescript
// e2e/pages/login-page.ts
import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Log in' });
    this.errorMessage = page.getByRole('alert');
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toHaveText(message);
  }
}
```

```typescript
// e2e/pages/dashboard-page.ts
import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly statsCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.userMenu = page.getByRole('button', { name: /user menu/i });
    this.logoutButton = page.getByRole('menuitem', { name: 'Log out' });
    this.statsCards = page.getByTestId('stats-card');
  }

  async expectLoaded() {
    await expect(this.heading).toHaveText('Dashboard');
    await expect(this.page).toHaveURL('/dashboard');
  }

  async logout() {
    await this.userMenu.click();
    await this.logoutButton.click();
  }

  async getStatsCount() {
    return this.statsCards.count();
  }
}
```

```typescript
// e2e/auth.test.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login-page';
import { DashboardPage } from './pages/dashboard-page';

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login('alice@example.com', 'password123');
    await dashboard.expectLoaded();
  });

  test('invalid credentials show error', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('alice@example.com', 'wrong-password');
    await loginPage.expectError('Invalid email or password');
  });

  test('logout returns to login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    await loginPage.goto();
    await loginPage.login('alice@example.com', 'password123');
    await dashboard.expectLoaded();
    await dashboard.logout();

    await expect(page).toHaveURL('/login');
  });
});
```

Page objects make tests read like user stories. They also centralize selectors — when your markup changes, you update one place instead of every test.

## Testing Navigation Flows

SvelteKit's client-side navigation means page transitions happen without full page reloads. Test that navigation works correctly:

```typescript
// e2e/navigation.test.ts
import { test, expect } from '@playwright/test';

test.describe('Site navigation', () => {
  test('main menu links navigate correctly', async ({ page }) => {
    await page.goto('/');

    // Click through each main nav link
    await page.getByRole('navigation').getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL('/products');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Products');

    await page.getByRole('navigation').getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL('/about');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Us');

    await page.getByRole('navigation').getByRole('link', { name: 'Contact' }).click();
    await expect(page).toHaveURL('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
  });

  test('browser back button works with client-side navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL('/products');

    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('deep linking works (direct URL access)', async ({ page }) => {
    await page.goto('/products/42');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('404 page shows for invalid routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
```

## Testing Form Submissions

E2E form tests verify the full flow including server-side processing:

```typescript
// e2e/signup.test.ts
import { test, expect } from '@playwright/test';

test.describe('User registration', () => {
  test('successful signup flow', async ({ page }) => {
    await page.goto('/signup');

    // Fill in registration form
    await page.getByLabel('Full name').fill('Alice Johnson');
    await page.getByLabel('Email').fill(`alice-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByLabel('Confirm password').fill('SecureP@ss123');
    await page.getByRole('checkbox', { name: 'I agree to the terms' }).check();

    // Submit
    await page.getByRole('button', { name: 'Create account' }).click();

    // Verify redirect to onboarding
    await expect(page).toHaveURL('/onboarding');
    await expect(page.getByText('Welcome, Alice!')).toBeVisible();
  });

  test('shows validation errors for invalid input', async ({ page }) => {
    await page.goto('/signup');

    // Submit empty form
    await page.getByRole('button', { name: 'Create account' }).click();

    // Check all validation messages appear
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Password').fill('password1');
    await page.getByLabel('Confirm password').fill('password2');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('shows error for duplicate email', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Full name').fill('Bob');
    await page.getByLabel('Email').fill('existing@example.com');
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByLabel('Confirm password').fill('SecureP@ss123');
    await page.getByRole('checkbox', { name: 'I agree to the terms' }).check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('An account with this email already exists')).toBeVisible();
  });
});
```

## Testing Authenticated Flows with Storage State

Logging in before every test is slow. Playwright's storage state feature lets you log in once and reuse the authentication state across all tests:

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();

  // Wait until the page receives the cookies
  await page.waitForURL('/dashboard');

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
```

Add the setup project to your Playwright config:

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    // Setup project — runs first
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/
    },

    // Tests that need authentication
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json'
      },
      dependencies: ['setup']
    }
  ]
});
```

Now every test in the `chromium` project starts already logged in. Add `e2e/.auth/` to your `.gitignore`.

For tests that need a specific user (admin, different role):

```typescript
// e2e/admin.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/admin');
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
```

```typescript
// playwright.config.ts — add an admin project
{
  name: 'admin-tests',
  testMatch: /.*admin.*\.test\.ts/,
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'e2e/.auth/admin.json'
  },
  dependencies: ['admin-setup']
}
```

## Network Interception for API Mocking

Sometimes you need to test how your app handles specific API responses without depending on a real backend. Playwright's `route` API intercepts network requests:

```typescript
// e2e/products.test.ts
import { test, expect } from '@playwright/test';

test('displays products from API', async ({ page }) => {
  // Intercept the API call and return mock data
  await page.route('/api/products', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Widget', price: 999 },
        { id: 2, name: 'Gadget', price: 2499 }
      ])
    });
  });

  await page.goto('/products');

  await expect(page.getByText('Widget')).toBeVisible();
  await expect(page.getByText('Gadget')).toBeVisible();
});

test('shows error state when API fails', async ({ page }) => {
  await page.route('/api/products', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' })
    });
  });

  await page.goto('/products');

  await expect(page.getByText('Failed to load products')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('shows empty state when no products exist', async ({ page }) => {
  await page.route('/api/products', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('/products');

  await expect(page.getByText('No products found')).toBeVisible();
});

test('handles slow API responses', async ({ page }) => {
  await page.route('/api/products', async (route) => {
    // Simulate a 3-second delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Widget', price: 999 }])
    });
  });

  await page.goto('/products');

  // Loading state should appear
  await expect(page.getByText('Loading products...')).toBeVisible();

  // Then products should appear
  await expect(page.getByText('Widget')).toBeVisible({ timeout: 5000 });
});
```

### Intercepting to Spy on Requests

You can also intercept requests to verify what your app sends:

```typescript
test('sends correct data when creating a product', async ({ page }) => {
  let capturedRequest: any;

  await page.route('/api/products', async (route) => {
    capturedRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 99, ...capturedRequest })
    });
  });

  await page.goto('/products/new');
  await page.getByLabel('Product name').fill('New Widget');
  await page.getByLabel('Price').fill('29.99');
  await page.getByLabel('Category').selectOption('tools');
  await page.getByRole('button', { name: 'Create product' }).click();

  expect(capturedRequest).toEqual({
    name: 'New Widget',
    price: '29.99',
    category: 'tools'
  });
});
```

## Mobile Viewport Testing

Responsive design needs testing too. Playwright makes this easy with device emulation:

```typescript
// e2e/mobile.test.ts
import { test, expect, devices } from '@playwright/test';

test.describe('Mobile experience', () => {
  test.use({ ...devices['iPhone 13'] });

  test('hamburger menu opens on mobile', async ({ page }) => {
    await page.goto('/');

    // Desktop nav should be hidden
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    // Hamburger button should be visible
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toBeVisible();

    // Click to open
    await menuButton.click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    // Navigate via mobile menu
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL('/products');

    // Menu should close after navigation
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  });

  test('touch-friendly tap targets', async ({ page }) => {
    await page.goto('/products');

    // Verify buttons are large enough for touch (44x44 minimum)
    const addToCartButton = page.getByRole('button', { name: 'Add to cart' }).first();
    const box = await addToCartButton.boundingBox();

    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
```

You can also define mobile projects in your config to run all tests on mobile:

```typescript
// playwright.config.ts
projects: [
  { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  { name: 'Mobile Android', use: { ...devices['Pixel 5'] } }
]
```

## Visual Regression Testing

Playwright can capture screenshots and compare them against baselines to catch unintended visual changes:

```typescript
// e2e/visual.test.ts
import { test, expect } from '@playwright/test';

test('home page matches visual baseline', async ({ page }) => {
  await page.goto('/');

  // Wait for all content to load
  await page.waitForLoadState('networkidle');

  // Full page screenshot comparison
  await expect(page).toHaveScreenshot('home-page.png', {
    maxDiffPixels: 100,  // Allow minor anti-aliasing differences
    fullPage: true
  });
});

test('product card component matches baseline', async ({ page }) => {
  await page.goto('/products');

  // Screenshot a specific element
  const productCard = page.getByTestId('product-card').first();
  await expect(productCard).toHaveScreenshot('product-card.png');
});
```

First run creates the baseline images. Subsequent runs compare against them. Update baselines with:

```bash
npx playwright test --update-snapshots
```

**Caveat**: visual regression tests are sensitive to OS-level font rendering. A screenshot taken on macOS will differ from one on Linux. Run visual tests in Docker or CI with a consistent environment to avoid false positives. Playwright provides a Docker image for this:

```yaml
# CI workflow with consistent rendering
jobs:
  visual:
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.40.0-jammy
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright test --project=chromium
```

## Parallel Test Execution

Playwright runs tests in parallel by default. Each test gets its own isolated browser context, so there is no shared state between tests. But you need to be aware of shared server-side state:

```typescript
// Tests that modify the same database record must not run in parallel
test.describe.serial('Order lifecycle', () => {
  let orderId: string;

  test('create an order', async ({ page }) => {
    await page.goto('/products/1');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.goto('/checkout');
    await page.getByRole('button', { name: 'Place order' }).click();

    // Extract order ID from the URL
    const url = page.url();
    orderId = url.split('/orders/')[1];
    expect(orderId).toBeTruthy();
  });

  test('view the order', async ({ page }) => {
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });

  test('cancel the order', async ({ page }) => {
    await page.goto(`/orders/${orderId}`);
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByText('Order cancelled')).toBeVisible();
  });
});
```

`test.describe.serial` forces tests within the block to run sequentially in order. Use this sparingly — only when tests genuinely depend on each other.

## CI Integration

A complete CI workflow for SvelteKit with Playwright:

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Build the application
        run: npm run build

      - name: Run E2E tests
        run: npx playwright test --project=chromium

      - name: Upload test report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: test-results/
          retention-days: 7
```

Key CI optimizations:

- **Install only `chromium`** — downloading all three browsers triples the install time. Test on multiple browsers only in nightly or pre-release builds.
- **`if: always()`** for the report — upload the HTML report even when tests pass so you can review the run.
- **`if: failure()`** for test results — only upload screenshots and videos when something fails to save storage.
- **`timeout-minutes: 30`** — prevent hung tests from burning CI minutes indefinitely.
- **`cache: 'npm'`** — cache node_modules between runs.

### Caching Playwright Browsers

Browser downloads are large. Cache them in CI:

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium
```

## Debugging Failing E2E Tests

When a test fails, Playwright provides several debugging tools:

### Trace Viewer

The trace file captures every action, network request, DOM snapshot, and console message:

```bash
npx playwright show-trace test-results/auth-test/trace.zip
```

### UI Mode

Interactive mode lets you step through tests, see the DOM at each step, and pick locators:

```bash
npx playwright test --ui
```

### Debug Mode

Headed mode with the debugger attached:

```bash
npx playwright test --debug
```

### Codegen

Record interactions in a browser and generate test code:

```bash
npx playwright codegen http://localhost:5173
```

This opens a browser. Every click, type, and navigation is recorded as Playwright code.

## Complete E2E Test Suite: Multi-Page Shopping Flow

Here is a complete, production-quality E2E test suite for an e-commerce checkout flow:

```typescript
// e2e/checkout-flow.test.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cart before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('cart'));
  });

  test('complete purchase from browse to confirmation', async ({ page }) => {
    // Step 1: Browse products
    await page.goto('/products');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Products');

    // Step 2: Filter by category
    await page.getByRole('combobox', { name: 'Category' }).selectOption('electronics');
    await expect(page.getByRole('article')).toHaveCount(6);

    // Step 3: Add a product to cart
    const firstProduct = page.getByRole('article').first();
    const productName = await firstProduct.getByRole('heading').textContent();
    await firstProduct.getByRole('button', { name: 'Add to cart' }).click();

    // Verify cart badge updates
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Step 4: Add another product
    const secondProduct = page.getByRole('article').nth(1);
    await secondProduct.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    // Step 5: Go to cart
    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page).toHaveURL('/cart');
    await expect(page.getByRole('listitem')).toHaveCount(2);

    // Step 6: Update quantity
    const quantityInput = page.getByLabel('Quantity').first();
    await quantityInput.fill('3');
    await quantityInput.press('Tab'); // Trigger change event

    // Verify total updates
    await expect(page.getByTestId('cart-total')).not.toHaveText('$0.00');

    // Step 7: Proceed to checkout
    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page).toHaveURL('/checkout');

    // Step 8: Fill shipping information
    await page.getByLabel('Full name').fill('Alice Johnson');
    await page.getByLabel('Street address').fill('123 Main St');
    await page.getByLabel('City').fill('Portland');
    await page.getByLabel('State').selectOption('OR');
    await page.getByLabel('ZIP code').fill('97201');

    // Step 9: Fill payment (test card)
    await page.getByLabel('Card number').fill('4242424242424242');
    await page.getByLabel('Expiration').fill('12/29');
    await page.getByLabel('CVC').fill('123');

    // Step 10: Place order
    await page.getByRole('button', { name: 'Place order' }).click();

    // Step 11: Verify confirmation
    await expect(page).toHaveURL(/\/orders\/\w+/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order Confirmed');
    await expect(page.getByText(productName!)).toBeVisible();
    await expect(page.getByText('Alice Johnson')).toBeVisible();
    await expect(page.getByText('123 Main St')).toBeVisible();
  });

  test('cart persists across page navigations', async ({ page }) => {
    await page.goto('/products');

    // Add item
    await page.getByRole('article').first().getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Navigate away and back
    await page.goto('/about');
    await page.goto('/cart');

    // Cart should still have the item
    await expect(page.getByRole('listitem')).toHaveCount(1);
  });

  test('removing items from cart', async ({ page }) => {
    await page.goto('/products');

    // Add two items
    await page.getByRole('article').nth(0).getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('article').nth(1).getByRole('button', { name: 'Add to cart' }).click();

    await page.goto('/cart');
    await expect(page.getByRole('listitem')).toHaveCount(2);

    // Remove the first item
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByRole('listitem')).toHaveCount(1);
  });

  test('empty cart shows message and link to products', async ({ page }) => {
    await page.goto('/cart');

    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse products' })).toBeVisible();

    await page.getByRole('link', { name: 'Browse products' }).click();
    await expect(page).toHaveURL('/products');
  });

  test('checkout validates required fields', async ({ page }) => {
    // Add item and go to checkout
    await page.goto('/products');
    await page.getByRole('article').first().getByRole('button', { name: 'Add to cart' }).click();
    await page.goto('/checkout');

    // Try to submit without filling fields
    await page.getByRole('button', { name: 'Place order' }).click();

    // Should show validation errors
    await expect(page.getByText('Full name is required')).toBeVisible();
    await expect(page.getByText('Address is required')).toBeVisible();
  });
});
```

This test suite covers the entire shopping flow: browsing, filtering, adding to cart, updating quantities, removing items, checkout with shipping and payment, order confirmation, cart persistence, empty states, and validation. Each test is independent (cleared cart in `beforeEach`), uses accessible locators, and verifies both UI state and URL changes.

## Try It

### Exercise 1: E2E Test for a Todo App

Write an E2E test suite for a todo app. Cover these flows: navigate to the page, add three tasks by typing and pressing Enter, mark one as complete by clicking its checkbox, verify the "completed" styling, delete a task using its remove button, verify the remaining count label updates, use the filter buttons to switch between "All", "Active", and "Completed" views.

### Exercise 2: Page Objects for a Blog

Create page objects for a blog application with a `HomePage` (list of posts, pagination), `PostPage` (title, content, comments), and `NewPostPage` (form with title, body, tags). Write E2E tests that create a post, verify it appears on the home page, navigate to it, add a comment, and verify the comment appears.

### Exercise 3: Mobile and Responsive Tests

Write E2E tests that run on both desktop and mobile viewports. Test that a navigation menu collapses to a hamburger on mobile, a multi-column product grid stacks to single-column on mobile, and form inputs are large enough for touch targets (minimum 44px).

## Key Takeaways

- E2E tests automate real browsers to verify complete user workflows across the full stack
- Playwright auto-waits for elements and assertions, eliminating flaky tests caused by timing
- Use role-based locators (`getByRole`, `getByLabel`) for tests that are resilient to markup changes
- The Page Object pattern centralizes selectors and interactions for maintainability
- Use storage state to authenticate once and reuse sessions across tests, avoiding repeated logins
- Network interception with `page.route()` lets you test error states, empty states, and slow responses without a real backend
- Visual regression testing catches unintended CSS changes but requires consistent rendering environments
- Run E2E tests in CI with artifact uploads for reports, screenshots, and traces
- Use `test.describe.serial` sparingly for tests that genuinely depend on shared server state
- Debug failing tests with trace viewer, UI mode, and codegen to record new interactions
