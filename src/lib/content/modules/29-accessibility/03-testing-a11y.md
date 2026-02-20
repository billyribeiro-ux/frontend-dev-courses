# Testing Accessibility

Building with semantic HTML and proper ARIA is a great start, but how do you know if your app is truly accessible? You test it. Automated tools catch roughly 30-50% of accessibility issues — things like missing alt text, insufficient color contrast, and incorrect ARIA usage. The rest requires manual testing with keyboards and screen readers.

A layered testing approach gives you the best coverage: automated scans for the easy wins, keyboard testing for navigation flows, and occasional screen reader testing for the full experience.

## Using Lighthouse Accessibility Audit

Lighthouse is built into Chrome DevTools and runs a comprehensive accessibility audit with one click:

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

```svelte
<!-- Lighthouse will flag this -->
<a href="/settings">
  <svg>...</svg>
</a>

<!-- Fixed: add aria-label -->
<a href="/settings" aria-label="Settings">
  <svg aria-hidden="true">...</svg>
</a>
```

## Automated Testing with axe-core

For catching accessibility issues in your test suite, use `axe-core` with Playwright or Vitest:

```bash
npm install -D @axe-core/playwright
```

```typescript
// e2e/a11y.test.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home page has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('contact form is accessible', async ({ page }) => {
  await page.goto('/contact');

  const results = await new AxeBuilder({ page })
    .include('form')
    .analyze();

  expect(results.violations).toEqual([]);
});
```

Run this as part of your CI pipeline so accessibility regressions get caught before deployment.

## Screen Reader Testing Basics

Automated tools cannot test everything. Spend time navigating your app with a screen reader to understand the real experience:

- **macOS**: VoiceOver (built-in, toggle with Cmd + F5)
- **Windows**: NVDA (free download) or Narrator (built-in)
- **Linux**: Orca (built-in on GNOME)

Basic VoiceOver navigation:

```
Cmd + F5          → Turn VoiceOver on/off
Tab               → Move to next interactive element
VO + Right Arrow  → Move to next element (VO = Ctrl + Option)
VO + Space        → Activate element
VO + U            → Open rotor (landmarks, headings, links)
```

Test these scenarios with a screen reader:

1. Can you understand the page structure from headings alone?
2. Do all images have meaningful descriptions?
3. Are form fields properly labeled?
4. Do dynamic updates (toasts, modals) get announced?
5. Can you complete the main user flow without seeing the screen?

## Color Contrast Tools

WCAG requires a minimum contrast ratio of **4.5:1** for normal text and **3:1** for large text. Check your colors:

```css
/* Fails contrast (2.3:1) */
.bad {
  color: #999;
  background: #fff;
}

/* Passes contrast (7:1) */
.good {
  color: #333;
  background: #fff;
}
```

Tools to check contrast:

- **Chrome DevTools** — Hover over a color in the Styles panel to see the contrast ratio
- **WebAIM Contrast Checker** — Enter foreground and background colors online
- **Figma plugins** — Check contrast during the design phase

## Common Accessibility Mistakes

Avoid these frequent errors that automated tools often catch:

```svelte
<!-- Mistake: image without alt -->
<img src="/hero.jpg" />
<!-- Fix -->
<img src="/hero.jpg" alt="Mountain landscape at sunrise" />

<!-- Mistake: clicking a div instead of using a button -->
<div onclick={submit}>Submit</div>
<!-- Fix -->
<button onclick={submit}>Submit</button>

<!-- Mistake: placeholder as label -->
<input placeholder="Email" />
<!-- Fix -->
<label for="email">Email</label>
<input id="email" placeholder="you@example.com" />

<!-- Mistake: auto-playing media -->
<video autoplay src="/intro.mp4" />
<!-- Fix: require user interaction -->
<video controls src="/intro.mp4" />
```

## Try It

Run a Lighthouse accessibility audit on your project. Fix every issue it reports. Then add an axe-core Playwright test that scans your home page, product listing page, and login form for WCAG 2.1 AA violations. Finally, navigate your app with VoiceOver or NVDA and note any issues the automated tools missed.

## Key Takeaways

- Automated tools (Lighthouse, axe-core) catch 30-50% of accessibility issues — use them as a first line of defense
- Integrate `@axe-core/playwright` into your CI pipeline to prevent regressions
- Screen reader testing reveals issues that no automated tool can find
- Ensure a minimum color contrast ratio of 4.5:1 for normal text
- The most common mistakes are missing alt text, using divs instead of buttons, and labeling forms with placeholders
