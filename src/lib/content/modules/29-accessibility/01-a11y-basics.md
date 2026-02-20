# Accessibility Basics

Accessibility (often shortened to **a11y**) means building websites that everyone can use, including people who navigate with a keyboard, use screen readers, have low vision, or experience cognitive differences. This is not an optional extra — it is a fundamental part of web development.

Over one billion people worldwide live with some form of disability. When you skip accessibility, you exclude real users from your app. Beyond ethics, there are legal requirements: laws like the ADA and the European Accessibility Act require digital products to be accessible. The good news is that most accessibility improvements also make your site better for everyone.

## WCAG Guidelines Overview

The **Web Content Accessibility Guidelines (WCAG)** are the international standard for web accessibility. They are organized around four principles, known by the acronym **POUR**:

1. **Perceivable** — Users must be able to perceive the content (text alternatives for images, captions for video)
2. **Operable** — Users must be able to operate the interface (keyboard navigation, enough time to read)
3. **Understandable** — Content must be understandable (clear language, predictable navigation)
4. **Robust** — Content must work with assistive technologies (valid HTML, proper ARIA)

Aim for **WCAG 2.1 Level AA** as your baseline — this is the standard most legal requirements reference.

## Semantic HTML

The single most impactful thing you can do for accessibility is use the correct HTML elements:

```svelte
<!-- Bad: div soup -->
<div class="nav">
  <div class="nav-item" onclick={goHome}>Home</div>
</div>
<div class="heading">Welcome</div>

<!-- Good: semantic elements -->
<nav>
  <a href="/">Home</a>
</nav>
<h1>Welcome</h1>
```

Semantic elements communicate meaning to screen readers. A `<button>` announces itself as interactive. A `<nav>` tells users they are in a navigation region. A `<div>` says nothing.

Key semantic elements to use:

- `<header>`, `<main>`, `<footer>` for page structure
- `<nav>` for navigation
- `<h1>` through `<h6>` for headings (in order, never skip levels)
- `<button>` for actions, `<a>` for navigation
- `<form>`, `<label>`, `<input>` for forms
- `<ul>`, `<ol>`, `<li>` for lists
- `<table>`, `<th>`, `<td>` for tabular data

## ARIA Roles and Attributes

When semantic HTML is not enough, ARIA (Accessible Rich Internet Applications) fills the gap. But remember the first rule of ARIA: **do not use ARIA if a native HTML element exists**.

```svelte
<!-- ARIA for custom components -->
<div role="alert" aria-live="assertive">
  Form submitted successfully!
</div>

<div
  role="tablist"
  aria-label="Product information"
>
  <button role="tab" aria-selected={activeTab === 'details'}>
    Details
  </button>
  <button role="tab" aria-selected={activeTab === 'reviews'}>
    Reviews
  </button>
</div>

<!-- Hiding decorative content from screen readers -->
<span aria-hidden="true">★★★★☆</span>
<span class="sr-only">4 out of 5 stars</span>
```

Common ARIA attributes:

- `aria-label` — Provides an accessible name
- `aria-describedby` — Points to an element with a description
- `aria-hidden="true"` — Hides decorative content from screen readers
- `aria-live="polite"` — Announces dynamic content changes
- `aria-expanded` — Indicates if a collapsible section is open

## Alt Text Best Practices

Every `<img>` needs an `alt` attribute. The question is what to put in it:

```svelte
<!-- Informative image: describe what it shows -->
<img src="/chart.png" alt="Sales increased 40% from January to March 2024" />

<!-- Decorative image: use empty alt -->
<img src="/divider.png" alt="" />

<!-- Link image: describe the destination -->
<a href="/home">
  <img src="/logo.png" alt="Acme Store home page" />
</a>
```

Write alt text that conveys the **purpose** of the image, not just what it looks like. "Photo of a dog" is less useful than "Golden retriever playing fetch in the park."

## Try It

Audit one of your existing Svelte pages. Replace any `<div>` elements that should be semantic elements, add missing `alt` attributes to images, ensure headings follow a logical order, and add `aria-label` to any icon-only buttons.

## Key Takeaways

- Accessibility ensures your app works for everyone, including people using assistive technology
- WCAG 2.1 Level AA is the standard to aim for, organized around Perceivable, Operable, Understandable, and Robust
- Semantic HTML is the foundation — use the correct element before reaching for ARIA
- Every image needs an `alt` attribute: descriptive for informative images, empty for decorative ones
- ARIA fills gaps when native HTML is insufficient, but never use ARIA to replicate what HTML already provides
