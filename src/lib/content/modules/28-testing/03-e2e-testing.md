# E2E Testing with Playwright

Unit tests verify functions. Component tests verify UI pieces. But neither tells you if the whole app works when a user clicks through it from start to finish. **End-to-end (E2E) tests** automate a real browser to test your complete application — loading pages, filling out forms, clicking buttons, and verifying the results.

Playwright is a modern E2E testing tool from Microsoft that controls Chromium, Firefox, and WebKit browsers. It is fast, reliable, and included as an option when you scaffold a SvelteKit project.

## Setting Up Playwright

If you did not add Playwright during project creation, install it manually:

```bash
npm install -D @playwright/test
npx playwright install
```

Create a configuration file:

```typescript
// playwright.config.ts
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173
  },
  testDir: 'e2e',
  testMatch: '**/*.test.ts'
};

export default config;
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

  await page.click('a[href="/about"]');
  await expect(page).toHaveURL('/about');
  await expect(page.locator('h1')).toHaveText('About Us');
});
```

Run tests with:

```bash
npx playwright test
```

## Page Navigation

Playwright provides clear methods for navigating:

```typescript
test('multi-page flow', async ({ page }) => {
  // Go to a URL
  await page.goto('/products');

  // Click a link and wait for navigation
  await page.click('text=View Details');
  await expect(page).toHaveURL(/\/products\/\d+/);

  // Go back
  await page.goBack();
  await expect(page).toHaveURL('/products');
});
```

## Filling Out Forms

Test user input flows end to end:

```typescript
test('user can sign up', async ({ page }) => {
  await page.goto('/signup');

  // Fill in form fields
  await page.fill('input[name="name"]', 'Alice Johnson');
  await page.fill('input[name="email"]', 'alice@example.com');
  await page.fill('input[name="password"]', 'securepassword123');

  // Submit the form
  await page.click('button[type="submit"]');

  // Verify success
  await expect(page.locator('.success-message')).toHaveText('Account created!');
  await expect(page).toHaveURL('/dashboard');
});
```

## Assertions

Playwright assertions auto-wait for elements to appear:

```typescript
test('product page displays correctly', async ({ page }) => {
  await page.goto('/products/1');

  // Text content
  await expect(page.locator('h1')).toHaveText('Premium Widget');

  // Visibility
  await expect(page.locator('.price')).toBeVisible();
  await expect(page.locator('.out-of-stock')).toBeHidden();

  // Attributes
  await expect(page.locator('img.product-image')).toHaveAttribute('alt', 'Premium Widget');

  // Count
  await expect(page.locator('.review')).toHaveCount(5);
});
```

## Testing with Authentication

For pages that require login, create a reusable helper:

```typescript
// e2e/helpers.ts
import type { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}
```

```typescript
// e2e/dashboard.test.ts
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('dashboard shows user data', async ({ page }) => {
  await login(page, 'test@example.com', 'password');

  await expect(page.locator('h1')).toHaveText('Dashboard');
  await expect(page.locator('.user-name')).toHaveText('Test User');
});
```

## Running Tests in CI

Add Playwright to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Try It

Write an E2E test for a todo app flow: navigate to the page, add three tasks, mark one as complete, delete another, and verify the remaining tasks are correct. Use meaningful selectors and Playwright's auto-waiting assertions.

## Key Takeaways

- E2E tests automate a real browser to verify complete user workflows
- Playwright auto-waits for elements, reducing flaky tests caused by timing issues
- Use `page.goto()`, `page.fill()`, and `page.click()` to simulate user actions
- Create reusable helpers for common flows like authentication
- Run E2E tests in CI and upload failure reports as artifacts for debugging
