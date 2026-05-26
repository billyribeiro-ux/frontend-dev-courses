# Accessibility Basics

Accessibility (often shortened to **a11y**) means building websites that everyone can use, including people who navigate with a keyboard, use screen readers, have low vision, or experience cognitive differences. This is not an optional feature you bolt on before launch. It is a fundamental quality of well-engineered software, in the same way that security or performance is.

Over one billion people worldwide live with some form of disability. When you skip accessibility, you exclude real users from your app. But the moral argument is only half the story. In many jurisdictions, accessibility is a **legal requirement**. The Americans with Disabilities Act (ADA) in the US, the European Accessibility Act (EAA) in the EU, and similar laws in Canada, the UK, Australia, and elsewhere all require digital products to be accessible. Lawsuits over inaccessible websites have grown year after year. This is not a theoretical risk — it is happening to real companies right now.

The good news: most accessibility improvements also make your site better for **everyone**. Keyboard navigation helps power users. Good color contrast helps people using their phone in sunlight. Captions help anyone watching video in a noisy cafe. Accessibility is not a zero-sum game.

## The Mental Model: How People Use the Web Differently

To build accessible software, you need to understand how different people experience your UI:

- **Screen reader users** (blind or low-vision) hear your page read aloud. They navigate by headings, landmarks, and links. They never see your layout — they experience a linear stream of semantic information. If your "button" is a `<div>` with an `onclick`, it does not exist to them.
- **Keyboard-only users** (motor impairments, repetitive strain injury, or preference) navigate with Tab, Shift+Tab, Enter, Space, and arrow keys. If a control cannot receive focus or does not respond to keyboard events, they cannot use it.
- **Low-vision users** may zoom to 200-400%, use high-contrast modes, or have custom color schemes. If your layout breaks at high zoom or your text relies solely on color to convey meaning, they lose information.
- **Users with vestibular disorders** can experience nausea, dizziness, or migraines from parallax scrolling, auto-playing animations, or rapid transitions. The `prefers-reduced-motion` media query exists specifically for them.
- **Cognitive differences** (ADHD, dyslexia, autism) mean users benefit from clear language, consistent navigation, and predictable interactions.

The key insight: you are not building "for disabled people." You are building for **all the ways people use the web**. Your future self with a broken arm will thank you.

## WCAG Guidelines Overview

The **Web Content Accessibility Guidelines (WCAG)** are the international standard for web accessibility. They are organized around four principles, known by the acronym **POUR**:

1. **Perceivable** — Users must be able to perceive the content (text alternatives for images, captions for video)
2. **Operable** — Users must be able to operate the interface (keyboard navigation, enough time to read)
3. **Understandable** — Content must be understandable (clear language, predictable navigation)
4. **Robust** — Content must work with assistive technologies (valid HTML, proper ARIA)

Aim for **WCAG 2.1 Level AA** as your baseline — this is the standard most legal requirements reference. Level AAA is aspirational for most projects, but worth pursuing for critical content.

## Semantic HTML: The Foundation

The single most impactful thing you can do for accessibility is use the correct HTML elements. Semantic HTML communicates meaning to assistive technologies **for free**. A `<button>` announces itself as interactive, is focusable, responds to Enter and Space, and can be found by screen reader users scanning for controls. A `<div>` with an `onclick` does none of these things — you would have to manually add `role="button"`, `tabindex="0"`, keyboard event handlers, and focus styles. Why rebuild what the platform gives you?

```svelte
<!-- Bad: div soup — invisible to assistive technology -->
<div class="nav">
  <div class="nav-item" onclick={goHome}>Home</div>
</div>
<div class="heading">Welcome</div>
<div class="btn" onclick={submit}>Submit</div>

<!-- Good: semantic elements — accessible by default -->
<nav>
  <a href="/">Home</a>
</nav>
<h1>Welcome</h1>
<button onclick={submit}>Submit</button>
```

Key semantic elements and when to use them:

- `<header>`, `<main>`, `<footer>` — page-level landmarks that screen readers use for navigation
- `<nav>` — navigation regions (use `aria-label` if you have multiple navs)
- `<h1>` through `<h6>` — heading hierarchy (never skip levels; headings are how screen reader users scan a page)
- `<button>` — for actions; `<a>` — for navigation to a URL
- `<form>`, `<label>`, `<input>` — forms; always associate labels with inputs using `for`/`id` or nesting
- `<ul>`, `<ol>`, `<li>` — lists (screen readers announce "list of 5 items")
- `<table>`, `<th>`, `<td>` — tabular data with proper headers

## ARIA: When Native HTML Is Not Enough

ARIA (Accessible Rich Internet Applications) is a set of attributes that add semantic meaning to elements. It was created for situations where native HTML cannot express the interaction pattern — custom widgets like tab panels, comboboxes, tree views, or live regions.

**The first rule of ARIA: do not use ARIA if a native HTML element can do the job.** ARIA does not add behavior — it only adds semantics. A `<div role="button">` is announced as a button but still cannot be focused or activated by keyboard without additional code. A real `<button>` does all of that natively.

```svelte
<!-- ARIA for a custom tab interface (no native HTML equivalent) -->
<div role="tablist" aria-label="Product information">
  <button role="tab" aria-selected={activeTab === 'details'} aria-controls="panel-details">
    Details
  </button>
  <button role="tab" aria-selected={activeTab === 'reviews'} aria-controls="panel-reviews">
    Reviews
  </button>
</div>
<div role="tabpanel" id="panel-details" aria-labelledby="tab-details">
  <!-- panel content -->
</div>

<!-- Live regions: announce dynamic content changes -->
<div role="alert" aria-live="assertive">
  Form submitted successfully!
</div>

<!-- Hiding decorative content from screen readers -->
<span aria-hidden="true">★★★★☆</span>
<span class="sr-only">4 out of 5 stars</span>
```

Common ARIA attributes worth knowing:

- `aria-label` — provides an accessible name when visible text is not available
- `aria-describedby` — points to an element with additional description
- `aria-hidden="true"` — hides decorative content from the accessibility tree
- `aria-live="polite"` / `"assertive"` — announces dynamic content changes
- `aria-expanded` — indicates whether a collapsible section is open or closed
- `aria-controls` — identifies which element is controlled by this one

## Keyboard Navigation and Focus Management

Keyboard accessibility is non-negotiable. Every interactive element must be reachable and operable via keyboard:

- **Tab** moves forward through focusable elements; **Shift+Tab** moves backward
- **Enter** activates links and buttons; **Space** activates buttons and toggles checkboxes
- **Escape** closes modals, dropdowns, and popovers
- **Arrow keys** navigate within composite widgets (tabs, menus, radio groups)

Focus management becomes critical in dynamic UIs. When a modal opens, focus must move into the modal. When it closes, focus must return to the trigger. And while the modal is open, Tab should be **trapped** inside — it should not escape to the page behind.

```svelte
<script lang="ts">
  let dialogEl: HTMLDialogElement;
  let triggerEl: HTMLButtonElement;
  let isOpen = $state(false);

  function openModal() {
    isOpen = true;
    dialogEl.showModal(); // native <dialog> traps focus automatically!
  }

  function closeModal() {
    isOpen = false;
    dialogEl.close();
    triggerEl.focus(); // return focus to the trigger
  }
</script>

<button bind:this={triggerEl} onclick={openModal}>
  Open Settings
</button>

<dialog
  bind:this={dialogEl}
  onclose={closeModal}
  aria-labelledby="dialog-title"
>
  <h2 id="dialog-title">Settings</h2>
  <p>Configure your preferences below.</p>

  <label>
    Name: <input type="text" />
  </label>

  <button onclick={closeModal}>Close</button>
</dialog>
```

Notice the use of the native `<dialog>` element. It gives you focus trapping, Escape-to-close, and a backdrop for free. This is semantic HTML doing the hard accessibility work for you.

## Color Contrast

Insufficient color contrast is one of the most common accessibility failures. WCAG defines two levels:

- **AA**: 4.5:1 contrast ratio for normal text, 3:1 for large text (18px bold or 24px regular)
- **AAA**: 7:1 contrast ratio for normal text, 4.5:1 for large text

Never rely on color alone to convey information. If an error state is only indicated by red text, a colorblind user misses it. Always pair color with an icon, text label, or pattern.

```svelte
<!-- Bad: color alone indicates error -->
<input class="border-red-500" />

<!-- Good: color + icon + text -->
<input class="border-red-500" aria-describedby="email-error" aria-invalid="true" />
<p id="email-error" class="text-red-600">
  <span aria-hidden="true">⚠</span> Please enter a valid email address
</p>
```

Tools to check contrast: Chrome DevTools (inspect element and look at the contrast ratio), the WebAIM Contrast Checker, and the axe browser extension.

## Svelte's Built-in a11y Warnings

Svelte's compiler includes accessibility checks that catch common mistakes at build time. If you write an `<img>` without an `alt` attribute, Svelte warns you. If you put a click handler on a non-interactive element without a keyboard equivalent, Svelte warns you.

These warnings cover issues like:

- Missing `alt` attributes on images
- Click handlers on non-interactive elements without keyboard handlers
- Missing form labels
- Autofocus misuse
- Redundant ARIA roles (like `role="button"` on a `<button>`)
- Missing `aria-` attribute values

These warnings are not exhaustive — they catch the low-hanging fruit. But they are a powerful first line of defense that most other frameworks do not offer. **Do not ignore them.**

## Alt Text Best Practices

Every `<img>` needs an `alt` attribute. The question is what to put in it:

```svelte
<!-- Informative image: describe what it shows AND its purpose -->
<img src="/chart.png" alt="Sales increased 40% from January to March 2024" />

<!-- Decorative image: use empty alt (not missing alt!) -->
<img src="/divider.png" alt="" />

<!-- Link image: describe the destination, not the image -->
<a href="/home">
  <img src="/logo.png" alt="Acme Store home page" />
</a>

<!-- Complex image: use aria-describedby for long descriptions -->
<figure>
  <img src="/architecture.png" alt="System architecture diagram" aria-describedby="arch-desc" />
  <figcaption id="arch-desc">
    The client sends requests to the API gateway, which routes to
    microservices A, B, and C. Each service connects to its own database.
  </figcaption>
</figure>
```

Write alt text that conveys the **purpose** of the image, not just what it looks like. "Photo of a dog" is less useful than "Golden retriever playing fetch in the park." An empty `alt=""` is correct for decorative images — it tells screen readers to skip the element entirely.

## Testing Accessibility

Building accessible software requires testing with the same rigor you apply to functionality:

1. **Keyboard testing** — Unplug your mouse (or just do not touch it) and try to complete every user flow. Can you reach every control? Can you tell where focus is? Can you escape modals?
2. **Screen reader testing** — Try VoiceOver (Mac), NVDA (Windows, free), or Orca (Linux). You will immediately discover what your "accessible" app sounds like to a blind user.
3. **Automated testing** — Use axe-core in your test suite for fast, repeatable checks:

```typescript
// In a Playwright test
import AxeBuilder from '@axe-core/playwright';

test('home page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

4. **Lighthouse** — Chrome DevTools > Lighthouse > Accessibility gives you a score and actionable suggestions.

Automated tools catch roughly 30-50% of accessibility issues. The rest require manual testing. A passing Lighthouse score does not mean your app is accessible — it means you have avoided the most obvious mistakes.

## Try It

1. Audit one of your existing Svelte pages. Replace any `<div>` elements that should be semantic elements, add missing `alt` attributes, ensure headings follow a logical order, and add `aria-label` to any icon-only buttons.
2. Build an accessible modal using the native `<dialog>` element. Verify that: focus moves into the modal when it opens, Tab cycles only through elements inside the modal, Escape closes it, and focus returns to the trigger button when it closes.
3. Install the axe browser extension and run it on your app. Fix every issue it reports.
4. Navigate your entire app using only the keyboard. Note every place you get stuck and fix it.

## Key Takeaways

- Accessibility is a legal requirement in many jurisdictions and a moral imperative — it is not optional
- Different users experience the web differently: screen readers, keyboard-only, low vision, vestibular disorders, cognitive differences
- Semantic HTML is the foundation — the right element gives you accessibility for free; a `<div>` gives you nothing
- ARIA fills gaps when native HTML is insufficient, but the first rule of ARIA is "do not use ARIA" if native HTML can do the job
- Focus management is critical for dynamic UIs — especially modals, which need focus trapping and focus restoration
- Color contrast must meet WCAG AA (4.5:1 for text) — and never rely on color alone to convey information
- Svelte's compiler catches common a11y mistakes at build time — pay attention to those warnings
- Automated tools catch 30-50% of issues; keyboard and screen reader testing catch the rest
- The native `<dialog>` element provides focus trapping, keyboard dismissal, and backdrop for free
