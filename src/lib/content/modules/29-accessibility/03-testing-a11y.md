# Testing Accessibility

Building with semantic HTML and proper ARIA is a great start, but how do you know if your app is truly accessible? You test it. And accessibility testing is not a single activity — it is a layered strategy, each layer catching different categories of issues.

**Automated tools** (axe-core, Lighthouse) catch roughly 30-50% of WCAG violations — structural issues like missing alt text, invalid ARIA attributes, insufficient color contrast, and heading order problems. They are fast, repeatable, and belong in your CI pipeline.

**Keyboard testing** catches navigation issues that automated tools cannot detect — focus traps, invisible focus indicators, unreachable interactive elements, and illogical tab order.

**Screen reader testing** reveals the real user experience — confusing announcements, missing context, dynamic content that is never announced, and flows that only make sense visually.

No single layer is sufficient. A page can score 100 on Lighthouse and still be completely unusable with a screen reader. Automated tools verify the *syntax* of accessibility. Manual testing verifies the *semantics* — whether the experience actually makes sense.

## Svelte's Built-in Accessibility Warnings

Before reaching for external tools, understand what Svelte already gives you. The Svelte compiler includes accessibility checks that warn you at build time about common violations. These are the `a11y-` warnings you see in your editor and terminal:

### What Svelte Catches

```svelte
<!-- a11y-missing-attribute: img must have alt -->
<img src="/hero.jpg" />

<!-- a11y-click-events-have-key-events: visible, non-interactive elements
     with click handlers must have keyboard listeners -->
<div onclick={handleClick}>Clickable div</div>

<!-- a11y-no-static-element-interactions: non-interactive elements
     should not have interactive handlers -->
<span onclick={doSomething}>Click me</span>

<!-- a11y-label-has-associated-control: labels must be linked to inputs -->
<label>Email</label>
<input type="email" />

<!-- a11y-autofocus: avoid autofocus as it can be disorienting -->
<input autofocus />

<!-- a11y-positive-tabindex: positive tabindex values are problematic -->
<div tabindex="5">Bad tab order</div>

<!-- a11y-no-noninteractive-tabindex: non-interactive elements should
     not be in the tab order -->
<p tabindex="0">This paragraph should not be focusable</p>

<!-- a11y-role-has-required-aria-props: roles require specific ARIA props -->
<div role="checkbox">Missing aria-checked</div>

<!-- a11y-hidden: interactive elements should not be hidden -->
<button aria-hidden="true">Hidden button</button>
```

### What Svelte Does NOT Catch

Svelte's warnings are compile-time heuristics. They cannot detect:

- Whether alt text is meaningful (it catches *missing* alt, not *bad* alt like `alt="image"`)
- Whether ARIA usage is correct in context (it validates attribute syntax but not semantics)
- Color contrast issues (requires runtime computation)
- Focus management problems (requires runtime interaction)
- Whether the reading order makes sense
- Whether dynamic content updates are announced to screen readers
- Whether keyboard navigation flows are logical

This is why Svelte's built-in checks are just the first layer. You need automated testing tools and manual testing to cover the rest.

## Automated Testing with axe-core

axe-core is the industry-standard accessibility testing engine. It evaluates rendered DOM against WCAG rules and produces detailed violation reports. There are two ways to integrate it: with Playwright for E2E tests, and with Vitest for component tests.

### axe-core with Playwright (E2E)

This is the most effective approach because it tests the fully rendered page in a real browser:

```bash
npm install -D @axe-core/playwright
```

```typescript
// e2e/a11y.test.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('home page has no WCAG AA violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('product listing page is accessible', async ({ page }) => {
    await page.goto('/products');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('contact form is accessible', async ({ page }) => {
    await page.goto('/contact');

    // Test just the form area
    const results = await new AxeBuilder({ page })
      .include('form')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Understanding axe Tags

axe-core groups rules into tags that correspond to WCAG guidelines:

| Tag | Meaning |
|-----|---------|
| `wcag2a` | WCAG 2.0 Level A (minimum conformance) |
| `wcag2aa` | WCAG 2.0 Level AA (standard target) |
| `wcag2aaa` | WCAG 2.0 Level AAA (enhanced) |
| `wcag21aa` | WCAG 2.1 Level AA additions |
| `wcag22aa` | WCAG 2.2 Level AA additions |
| `best-practice` | Not WCAG but recommended |
| `section508` | US Section 508 requirements |

For most projects, target `['wcag2a', 'wcag2aa', 'wcag21aa']`. Level AAA is aspirational — few sites achieve full compliance.

### Better Error Reporting

When axe finds violations, the default `toEqual([])` assertion produces hard-to-read output. Create a custom helper that formats violations clearly:

```typescript
// e2e/helpers/a11y.ts
import type { AxeResults } from 'axe-core';

export function formatViolations(violations: AxeResults['violations']): string {
  if (violations.length === 0) return 'No violations found';

  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => {
          const target = node.target.join(', ');
          const html = node.html.slice(0, 100);
          return `  - Element: ${target}\n    HTML: ${html}\n    Fix: ${node.failureSummary}`;
        })
        .join('\n');

      return `\n[${violation.id}] ${violation.description}\n  Impact: ${violation.impact}\n  Help: ${violation.helpUrl}\n${nodes}`;
    })
    .join('\n');
}
```

```typescript
// Usage in tests
import { formatViolations } from './helpers/a11y';

test('page is accessible', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(
    results.violations,
    formatViolations(results.violations)
  ).toEqual([]);
});
```

Now when a test fails, you see exactly which elements have violations, what the violation is, and a link to documentation on how to fix it.

### Excluding Known Issues

Sometimes third-party components or widgets have accessibility issues you cannot fix immediately. Exclude specific rules or regions temporarily (and document why):

```typescript
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  // Exclude the third-party chat widget we cannot control
  .exclude('#third-party-chat-widget')
  // Disable a specific rule (document the reason!)
  .disableRules(['color-contrast']) // TODO: Fix contrast in dark mode (#1234)
  .analyze();
```

Always add a TODO with a ticket number when excluding rules. Exclusions that stay forever are tech debt.

### axe-core with Vitest (Component Tests)

For testing individual components in isolation:

```bash
npm install -D vitest-axe
```

```typescript
// src/tests/setup.ts
import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
```

```typescript
// src/lib/components/Card.test.ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import Card from './Card.svelte';

describe('Card accessibility', () => {
  it('has no violations with all props', async () => {
    const { container } = render(Card, {
      props: {
        title: 'Product Name',
        description: 'A great product',
        imageUrl: '/product.jpg',
        imageAlt: 'Product photo showing the widget from the front',
        price: '$29.99'
      }
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no violations without optional image', async () => {
    const { container } = render(Card, {
      props: {
        title: 'Product Name',
        description: 'A great product',
        price: '$29.99'
      }
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

Component-level axe tests are faster than E2E tests and provide tighter feedback loops during development. Run them on every component to catch issues before they reach the page level.

## Lighthouse Accessibility Audits

Lighthouse is built into Chrome DevTools and runs a comprehensive accessibility audit:

1. Open Chrome DevTools (F12)
2. Go to the **Lighthouse** tab
3. Select **Accessibility** under Categories
4. Click **Analyze page load**

Lighthouse scores your page from 0 to 100 and lists specific issues with links to documentation. Common findings include:

- Missing `alt` attributes on images
- Insufficient color contrast ratios
- Missing form labels
- Heading levels that skip (e.g., `h1` to `h3`)
- Links without discernible text

### Automating Lighthouse in CI

Run Lighthouse programmatically with the `lighthouse` package:

```bash
npm install -D lighthouse chrome-launcher
```

```typescript
// scripts/lighthouse-audit.ts
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

async function runAudit(url: string) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    onlyCategories: ['accessibility']
  });

  await chrome.kill();

  const score = result?.lhr.categories.accessibility.score;
  console.log(`Accessibility score: ${(score ?? 0) * 100}`);

  if (score && score < 0.9) {
    console.error('Accessibility score below 90%. Failing.');

    const violations = result?.lhr.audits;
    if (violations) {
      Object.values(violations)
        .filter((audit: any) => audit.score === 0)
        .forEach((audit: any) => {
          console.error(`  FAIL: ${audit.title} — ${audit.description}`);
        });
    }

    process.exit(1);
  }
}

runAudit('http://localhost:4173');
```

### Lighthouse vs axe-core

Lighthouse uses axe-core internally for many of its checks but adds additional audits:

- **Lighthouse-only**: Performance impact of a11y issues, SEO-related a11y checks, PWA a11y requirements
- **axe-core strengths**: More granular control, better integration with test frameworks, rule exclusion/inclusion, element-level targeting

Use both: axe-core in your automated test suite for developer-level feedback, Lighthouse for periodic audits and overall scoring.

## Manual Testing with Screen Readers

Automated tools cannot evaluate whether your app *makes sense* to a non-visual user. Screen reader testing is the only way to verify the actual experience.

### VoiceOver (macOS)

VoiceOver is built into every Mac. Toggle it with `Cmd + F5`:

```
Essential VoiceOver commands:

Cmd + F5          → Turn VoiceOver on/off
VO + Right Arrow  → Move to next element (VO = Ctrl + Option)
VO + Left Arrow   → Move to previous element
Tab               → Move to next interactive element
VO + Space        → Activate element (click)
VO + U            → Open Rotor (navigate by headings, links, landmarks)
VO + A            → Read entire page from current position
VO + Shift + F5   → Set a VoiceOver "spot" to return to
```

### NVDA (Windows)

NVDA is a free, open-source screen reader for Windows. Download it from nvaccess.org:

```
Essential NVDA commands:

Insert + Space    → Toggle focus/browse mode
Tab               → Next interactive element
Insert + F7       → Elements list (headings, links, landmarks)
H                 → Next heading
D                 → Next landmark
K                 → Next link
F                 → Next form field
Insert + Down     → Read from current position
Escape            → Return to browse mode
```

### What to Test with a Screen Reader

Run through these scenarios and note any issues:

**1. Page Structure**
- Navigate by headings (VO+U or H in NVDA). Can you understand the page structure from headings alone?
- Navigate by landmarks. Does every major section have a landmark? (`<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`)
- Is the page title descriptive and unique?

**2. Images and Media**
- Do all images have meaningful alt text? (Not just "image" or the filename)
- Are decorative images hidden from screen readers? (`alt=""` or `aria-hidden="true"`)
- Do videos have captions?

**3. Forms**
- Is every input announced with its label?
- Are required fields announced as "required"?
- Are error messages announced when they appear?
- Can you complete the form and submit it without seeing the screen?

**4. Dynamic Content**
- When you add an item to the cart, is the change announced?
- When a toast notification appears, is it read aloud?
- When content loads asynchronously, does the screen reader announce it?
- When a modal opens, does focus move into it? When it closes, does focus return?

**5. Navigation**
- Does client-side navigation (SvelteKit) announce the new page?
- After navigation, where does focus land?
- Can you access all pages and features without seeing the screen?

### Creating a Screen Reader Testing Checklist

```markdown
## Screen Reader Audit - [Page Name]

### Structure
- [ ] Page has a unique, descriptive <title>
- [ ] Heading hierarchy is logical (h1 → h2 → h3, no skipping)
- [ ] All major sections use landmark elements
- [ ] Content reading order matches visual order

### Images
- [ ] All informative images have descriptive alt text
- [ ] Decorative images are hidden (alt="" or aria-hidden)
- [ ] Complex images/charts have extended descriptions

### Forms
- [ ] Every input has a visible, associated label
- [ ] Required fields are announced as required
- [ ] Error messages are associated with their inputs (aria-describedby)
- [ ] Form can be completed and submitted via keyboard+screen reader

### Dynamic Content
- [ ] Toasts/notifications are announced (role="status" or role="alert")
- [ ] Modal focus management works (trap, restore)
- [ ] Loading states are communicated (aria-busy, role="status")
- [ ] Content updates are announced via live regions

### Navigation
- [ ] Skip link works and is the first focusable element
- [ ] Client-side navigation is announced
- [ ] Focus is managed after navigation
```

## Testing Color Contrast

WCAG requires minimum contrast ratios between text and its background:

| Content | Level AA | Level AAA |
|---------|----------|-----------|
| Normal text (under 18pt) | 4.5:1 | 7:1 |
| Large text (18pt+ or 14pt bold) | 3:1 | 4.5:1 |
| UI components and graphics | 3:1 | Not defined |

### Checking Contrast in DevTools

Chrome DevTools shows contrast ratios inline:

1. Inspect an element with text
2. Click the color swatch in the Styles panel
3. The contrast ratio appears with a pass/fail indicator

### Programmatic Contrast Checking

Test contrast in your component tests:

```typescript
// src/lib/utils/contrast.ts
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(color1: [number, number, number], color2: [number, number, number]): number {
  const l1 = getLuminance(...color1);
  const l2 = getLuminance(...color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

```typescript
// src/lib/utils/contrast.test.ts
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('calculates correct ratio for black on white', () => {
    const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 0); // Maximum contrast
  });

  it('identifies insufficient contrast', () => {
    // Light gray on white
    const ratio = contrastRatio([153, 153, 153], [255, 255, 255]);
    expect(ratio).toBeLessThan(4.5); // Fails AA for normal text
  });

  it('identifies sufficient contrast', () => {
    // Dark gray on white
    const ratio = contrastRatio([51, 51, 51], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(4.5); // Passes AA
  });
});
```

### Common Contrast Problems and Fixes

```css
/* FAILS contrast (2.3:1) — light gray on white */
.bad-text {
  color: #999;
  background: #fff;
}

/* PASSES contrast (7:1) — dark gray on white */
.good-text {
  color: #333;
  background: #fff;
}

/* FAILS — placeholder text too light */
input::placeholder {
  color: #ccc; /* 1.6:1 contrast */
}

/* PASSES — darker placeholder */
input::placeholder {
  color: #767676; /* 4.5:1 contrast */
}

/* FAILS — low contrast button */
.btn-primary {
  color: #fff;
  background: #60a5fa; /* 2.4:1 */
}

/* PASSES — darker blue background */
.btn-primary {
  color: #fff;
  background: #2563eb; /* 4.6:1 */
}
```

Tools for checking contrast:
- **Chrome DevTools** — Inspect any element to see contrast ratio inline
- **WebAIM Contrast Checker** — Enter any two colors at https://webaim.org/resources/contrastchecker/
- **Figma plugins** (Stark, Contrast) — Check during the design phase
- **axe-core** — Catches most contrast violations automatically

## Testing Keyboard Navigation

Keyboard testing is fast and catches issues that automated tools miss entirely. Here is a systematic approach:

### The Tab Test

1. Open your page in a browser
2. Press Tab repeatedly from the top of the page
3. Note every element that receives focus

Verify:
- Focus indicator is always visible (you can see where you are)
- Focus order matches visual order (left-to-right, top-to-bottom)
- Every interactive element is reachable (buttons, links, inputs, selects)
- No non-interactive elements receive focus (paragraphs, headings, divs)
- Focus never gets trapped (you can always Tab out of a section)
- Skip link appears on first Tab press

### The Interaction Test

For each interactive element:
- **Buttons**: Enter and Space activate them
- **Links**: Enter follows them
- **Checkboxes**: Space toggles them
- **Radio buttons**: Arrow keys move between options
- **Select dropdowns**: Arrow keys change the selected option
- **Tabs**: Arrow keys switch tabs, Tab moves to panel content
- **Menus**: Arrow keys navigate, Enter/Space activate, Escape closes
- **Modals**: Focus trapped inside, Escape closes, focus restored on close

### Automated Keyboard Testing with Playwright

```typescript
// e2e/keyboard.test.ts
import { test, expect } from '@playwright/test';

test.describe('Keyboard navigation', () => {
  test('tab order follows visual order on home page', async ({ page }) => {
    await page.goto('/');

    // Tab through elements and verify the order
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('class', /skip-link/);

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveRole('link');
    await expect(page.locator(':focus')).toHaveText('Home');

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Products');
  });

  test('modal traps focus', async ({ page }) => {
    await page.goto('/products/1');

    // Open the delete confirmation modal
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify focus is inside the modal
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tab through all focusable elements in the modal
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    const confirmBtn = dialog.getByRole('button', { name: 'Delete' });
    const closeBtn = dialog.getByRole('button', { name: 'Close' });

    // Focus should cycle within the modal
    await cancelBtn.focus();
    await page.keyboard.press('Tab');
    await expect(confirmBtn).toBeFocused();

    // Escape closes the modal
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Focus should return to the delete button
    await expect(page.getByRole('button', { name: 'Delete' })).toBeFocused();
  });

  test('dropdown menu keyboard navigation', async ({ page }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'Account menu' });
    await menuButton.focus();

    // Enter opens the menu
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // Arrow down moves through items
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused();

    // Escape closes and returns focus
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();
  });
});
```

## Common WCAG Violations and How to Fix Them

Here are the most frequently found WCAG violations in web applications, ordered by how often they occur:

### 1. Missing Alt Text (WCAG 1.1.1)

```svelte
<!-- VIOLATION -->
<img src="/hero.jpg" />

<!-- FIX: Informative image — describe the content -->
<img src="/hero.jpg" alt="Mountain landscape at sunrise with orange and purple sky" />

<!-- FIX: Decorative image — empty alt attribute -->
<img src="/divider.svg" alt="" />

<!-- FIX: Image as link — describe the destination -->
<a href="/settings">
  <img src="/gear-icon.svg" alt="Settings" />
</a>

<!-- FIX: Complex image — use figure and figcaption -->
<figure>
  <img src="/chart.png" alt="Sales growth chart showing 40% increase over Q1-Q4 2024" />
  <figcaption>
    Quarterly sales figures: Q1: $1.2M, Q2: $1.5M, Q3: $1.8M, Q4: $2.1M
  </figcaption>
</figure>
```

### 2. Insufficient Color Contrast (WCAG 1.4.3)

```svelte
<!-- VIOLATION: 2.3:1 contrast ratio -->
<p style="color: #999; background: #fff;">Hard to read text</p>

<!-- FIX: 7:1 contrast ratio -->
<p style="color: #333; background: #fff;">Easy to read text</p>
```

### 3. Missing Form Labels (WCAG 1.3.1)

```svelte
<!-- VIOLATION: placeholder is not a label -->
<input type="email" placeholder="Email" />

<!-- FIX: Use a visible label -->
<label for="email">Email</label>
<input id="email" type="email" placeholder="you@example.com" />

<!-- FIX: If you must hide the label visually -->
<label for="search" class="sr-only">Search</label>
<input id="search" type="search" placeholder="Search products..." />
```

### 4. Using Divs as Buttons (WCAG 4.1.2)

```svelte
<!-- VIOLATION: not keyboard accessible, no role -->
<div class="btn" onclick={submit}>Submit</div>

<!-- FIX: use a button -->
<button onclick={submit}>Submit</button>
```

### 5. Empty Links (WCAG 2.4.4)

```svelte
<!-- VIOLATION: no accessible name -->
<a href="/settings">
  <svg viewBox="0 0 24 24">...</svg>
</a>

<!-- FIX: add aria-label -->
<a href="/settings" aria-label="Settings">
  <svg aria-hidden="true" viewBox="0 0 24 24">...</svg>
</a>
```

### 6. Heading Hierarchy (WCAG 1.3.1)

```svelte
<!-- VIOLATION: skipped heading levels -->
<h1>My App</h1>
<h3>Features</h3>  <!-- Should be h2 -->
<h5>Pricing</h5>   <!-- Should be h2 or h3 -->

<!-- FIX: sequential heading levels -->
<h1>My App</h1>
<h2>Features</h2>
<h3>Feature A</h3>
<h3>Feature B</h3>
<h2>Pricing</h2>
```

### 7. Missing Live Regions for Dynamic Content (WCAG 4.1.3)

```svelte
<!-- VIOLATION: screen reader never learns about this -->
{#if saved}
  <p class="success">Changes saved!</p>
{/if}

<!-- FIX: use aria-live or role -->
<div aria-live="polite">
  {#if saved}
    <p>Changes saved!</p>
  {/if}
</div>

<!-- Or use role="status" (implies aria-live="polite") -->
{#if saved}
  <p role="status">Changes saved!</p>
{/if}

<!-- For urgent messages like errors, use role="alert" -->
{#if error}
  <p role="alert">{error}</p>
{/if}
```

### 8. Missing Language Attribute (WCAG 3.1.1)

```html
<!-- VIOLATION -->
<html>

<!-- FIX -->
<html lang="en">

<!-- For multilingual content -->
<p>The French word for hello is <span lang="fr">bonjour</span>.</p>
```

## Integrating Accessibility Checks into CI

A complete CI pipeline that catches accessibility regressions:

```yaml
# .github/workflows/a11y.yml
name: Accessibility

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  a11y-lint:
    name: Svelte a11y warnings
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run check
        # svelte-check reports a11y warnings as errors

  a11y-axe:
    name: axe-core E2E scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test e2e/a11y.test.ts
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: a11y-report
          path: playwright-report/

  a11y-lighthouse:
    name: Lighthouse audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Start preview server
        run: npm run preview &
      - name: Wait for server
        run: npx wait-on http://localhost:4173
      - name: Run Lighthouse
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:4173/
            http://localhost:4173/products
            http://localhost:4173/contact
          budgetPath: .lighthouserc.json
```

Create a Lighthouse budget file:

```json
// .lighthouserc.json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

This CI pipeline runs three layers of checks:
1. **Svelte compiler warnings** — catches structural issues at build time
2. **axe-core scans** — catches WCAG violations in the rendered DOM
3. **Lighthouse audits** — provides an overall accessibility score with a minimum threshold

## Real-World Accessibility Audit Walkthrough

Let me walk through auditing a real page — a product detail page with common accessibility problems:

### Step 1: Automated Scan

Run axe-core and Lighthouse. Found issues:

```
[color-contrast] Elements must have sufficient color contrast ratio
  - .price element: #999 on #fff (2.3:1, needs 4.5:1)
  - .badge element: #fff on #60a5fa (2.4:1, needs 4.5:1)

[image-alt] Images must have alternate text
  - Product gallery images (5 images, all missing alt)

[label] Form elements must have labels
  - Quantity input has no label

[heading-order] Heading levels should only increase by one
  - h1 → h3 (skipped h2)

[link-name] Links must have discernible text
  - Social share icons (3 links with only SVG children)
```

### Step 2: Fix Automated Issues

```svelte
<!-- Fix contrast: darken the price color -->
<span class="price" style="color: #525252;">$29.99</span>

<!-- Fix contrast: darken the badge background -->
<span class="badge" style="background: #2563eb;">New</span>

<!-- Fix alt text: describe each product image -->
<img src="/product-front.jpg" alt="Widget viewed from the front, showing the control panel" />
<img src="/product-side.jpg" alt="Widget side profile showing the USB-C port" />

<!-- Fix label: add a visible label to the quantity input -->
<label for="quantity">Quantity</label>
<input id="quantity" type="number" min="1" max="10" value="1" />

<!-- Fix heading order: h1 → h2 instead of h1 → h3 -->
<h1>Premium Widget</h1>
<h2>Description</h2>
<h2>Reviews</h2>

<!-- Fix link names: add aria-label to icon links -->
<a href="https://twitter.com/share" aria-label="Share on Twitter">
  <svg aria-hidden="true">...</svg>
</a>
```

### Step 3: Keyboard Testing

Tab through the page:

- Skip link works and jumps to product content
- Image gallery thumbnails are focusable but have no keyboard activation (FIXED: add Enter/Space handlers)
- "Add to Cart" button works with Enter
- Quantity input works with arrow keys
- Review form: all fields accessible, submit works with Enter
- Tab order is logical: images, title, price, quantity, add to cart, description, reviews

### Step 4: Screen Reader Testing

Navigate with VoiceOver:

- Product title is announced as "heading level 1, Premium Widget" (correct)
- Price is announced as "$29.99" (correct, no context like "Price:")
  - FIXED: Add `aria-label="Price: $29.99"` or visually hidden "Price:" text
- Image gallery announces each image alt text (correct after fix)
- "Add to Cart" button announced as "Add to Cart, button" (correct)
- Star rating announced as "4 out of 5 stars" (correct, using `aria-label`)
- Review section: each review has heading and content properly structured

### Step 5: Document Remaining Issues

```markdown
## Audit Results - Product Detail Page

### Automated (axe-core + Lighthouse)
- [x] Fixed: Color contrast on price and badge
- [x] Fixed: Missing alt text on gallery images
- [x] Fixed: Missing quantity input label
- [x] Fixed: Heading hierarchy skip
- [x] Fixed: Social share links without names

### Keyboard
- [x] Fixed: Gallery thumbnail keyboard activation
- [ ] Enhancement: Add keyboard shortcuts for image gallery (left/right arrows)

### Screen Reader
- [x] Fixed: Price lacks context label
- [ ] Enhancement: Announce "Added to cart" confirmation via live region
- [ ] Enhancement: Gallery image count ("Image 2 of 5")

### Score: Lighthouse 97 (was 62), axe-core 0 violations (was 12)
```

## Try It

### Exercise 1: Audit Your Project

Run a complete accessibility audit on your SvelteKit project. Start with `npm run check` to see Svelte's built-in warnings. Then write an axe-core Playwright test that scans every page in your app. Fix every violation. Document what you found and how you fixed it.

### Exercise 2: Screen Reader Testing

Navigate your entire app using VoiceOver (Mac) or NVDA (Windows) without looking at the screen. Can you complete the main user flow? Note every point where the experience is confusing, where important information is not announced, and where focus gets lost. Fix at least three issues you find.

### Exercise 3: Build an A11y CI Pipeline

Set up a GitHub Actions workflow that runs three layers of accessibility checks: Svelte compiler warnings (`svelte-check`), axe-core E2E scans on your top five pages, and a Lighthouse audit with a minimum score of 90. Make the pipeline block merging when any check fails.

### Exercise 4: Contrast Audit

Inventory every text color and background color combination in your app. Calculate the contrast ratio for each pair. Fix every combination that falls below 4.5:1 for normal text or 3:1 for large text. Pay special attention to placeholder text, disabled states, and text on colored backgrounds or images.

## Key Takeaways

- Automated tools (axe-core, Lighthouse) catch 30-50% of WCAG violations — use them as your first line of defense, integrated into CI so regressions never ship
- Svelte's built-in `a11y-` warnings catch structural issues at compile time, but they cannot detect contrast, focus management, or semantic correctness
- axe-core with Playwright tests fully rendered pages in real browsers — use `withTags(['wcag2a', 'wcag2aa'])` to target Level AA conformance
- Screen reader testing reveals the real user experience — no automated tool can tell you whether your app makes sense to a non-visual user
- Ensure a minimum color contrast ratio of 4.5:1 for normal text and 3:1 for large text and UI components
- The most common violations are missing alt text, insufficient contrast, missing form labels, using divs instead of buttons, and empty links
- A complete CI pipeline includes three layers: Svelte compiler warnings, axe-core scans, and Lighthouse audits with score thresholds
- Accessibility auditing is iterative — fix automated issues first, then keyboard test, then screen reader test, and document everything
- Exclusions and suppressions for third-party components are acceptable but must be tracked with tickets and revisited regularly
