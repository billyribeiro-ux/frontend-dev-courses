# Accessibility Basics

Accessibility (often shortened to **a11y**) means building websites that everyone can use, including people who navigate with a keyboard, use screen readers, have low vision, or experience cognitive differences. This is not an optional feature you bolt on before launch. It is a fundamental quality of well-engineered software, in the same way that security or performance is. You would never ship a product without authentication. You should never ship one without accessibility either.

Over one billion people worldwide live with some form of disability. When you skip accessibility, you exclude real users from your app. But the moral argument is only half the story. In many jurisdictions, accessibility is a **legal requirement**. The Americans with Disabilities Act (ADA) in the US, the European Accessibility Act (EAA) in the EU, and similar laws in Canada, the UK, Australia, and elsewhere all require digital products to be accessible. Lawsuits over inaccessible websites have grown year over year -- over 4,000 ADA-related web accessibility lawsuits were filed in the US in 2023 alone. This is not a theoretical risk -- it is happening to companies of every size right now.

The good news: most accessibility improvements also make your site better for **everyone**. Keyboard navigation helps power users. Good color contrast helps people using their phone in sunlight. Captions help anyone watching video in a noisy cafe. Accessibility is not a zero-sum game.

## The Mental Model: How People Use the Web Differently

To build accessible software, you need to understand how different people experience your UI:

- **Screen reader users** (blind or low-vision) hear your page read aloud. They navigate by headings, landmarks, and links. They never see your layout -- they experience a linear stream of semantic information. If your "button" is a `<div>` with an `onclick`, it does not exist to them.
- **Keyboard-only users** (motor impairments, repetitive strain injury, or preference) navigate with Tab, Shift+Tab, Enter, Space, and arrow keys. If a control cannot receive focus or does not respond to keyboard events, they cannot use it.
- **Low-vision users** may zoom to 200-400%, use high-contrast modes, or have custom color schemes. If your layout breaks at high zoom or your text relies solely on color to convey meaning, they lose information.
- **Users with vestibular disorders** can experience nausea, dizziness, or migraines from parallax scrolling, auto-playing animations, or rapid transitions. The `prefers-reduced-motion` media query exists specifically for them.
- **Cognitive differences** (ADHD, dyslexia, autism) mean users benefit from clear language, consistent navigation, and predictable interactions.

The key insight: you are not building "for disabled people." You are building for **all the ways people use the web**. Your future self with a broken arm will thank you.

### The Temporary Disability Mental Model

Disability is not binary. Consider the spectrum:

```
Permanent          Temporary           Situational
──────────         ──────────          ─────────────
One arm            Arm in a cast       Holding a baby
Blind              Eye infection       Bright sunlight
Deaf               Ear infection       Noisy restaurant
Cognitive          Concussion          Stressed, multitasking
Motor impairment   RSI flare-up       Using phone on a bus
```

When you build for accessibility, you build for everyone across this entire spectrum. The person holding a baby needs one-handed navigation. The developer with RSI needs keyboard shortcuts. The commuter on a bus needs touch targets that work on a bumpy ride.

## WCAG Guidelines Overview

The **Web Content Accessibility Guidelines (WCAG)** are the international standard for web accessibility. They are organized around four principles, known by the acronym **POUR**:

1. **Perceivable** -- Users must be able to perceive the content (text alternatives for images, captions for video, sufficient color contrast)
2. **Operable** -- Users must be able to operate the interface (keyboard navigation, enough time to read, no seizure-triggering animations)
3. **Understandable** -- Content must be understandable (clear language, predictable navigation, error prevention)
4. **Robust** -- Content must work with assistive technologies (valid HTML, proper ARIA, future compatibility)

Aim for **WCAG 2.1 Level AA** as your baseline -- this is the standard most legal requirements reference. Level AAA is aspirational for most projects, but worth pursuing for critical content.

### The Three Levels

```
Level A:     Minimum accessibility -- absolute barriers removed
Level AA:    Standard compliance -- what the law usually requires
Level AAA:   Enhanced accessibility -- aspirational for most sites

Example (color contrast):
Level A:     3:1 for large text
Level AA:    4.5:1 for normal text, 3:1 for large text
Level AAA:   7:1 for normal text, 4.5:1 for large text
```

## Semantic HTML: The Foundation

The single most impactful thing you can do for accessibility is use the correct HTML elements. Semantic HTML communicates meaning to assistive technologies **for free**. A `<button>` announces itself as interactive, is focusable, responds to Enter and Space, and can be found by screen reader users scanning for controls. A `<div>` with an `onclick` does none of these things.

### The Cost of Div Soup

```svelte
<!-- WRONG: "div soup" -- invisible to assistive technology -->
<div class="nav">
  <div class="nav-item" onclick={goHome}>Home</div>
</div>
<div class="heading">Welcome</div>
<div class="btn" onclick={submit}>Submit</div>

<!-- To make that div "button" accessible, you would need ALL of this: -->
<div
  class="btn"
  role="button"
  tabindex="0"
  onclick={submit}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      submit();
    }
  }}
  aria-label="Submit form"
>
  Submit
</div>
<!-- 7 attributes to recreate what <button> gives you for free.
     And you STILL missed: focus styles, disabled state, form submission. -->
```

```svelte
<!-- CORRECT: semantic elements -- accessible by default -->
<nav>
  <a href="/">Home</a>
</nav>
<h1>Welcome</h1>
<button onclick={submit}>Submit</button>
<!-- Zero extra attributes. The browser handles focus, keyboard events, -->
<!-- screen reader announcement, and role -- all automatically. -->
```

```
# WRONG mental model: "I will add accessibility later with ARIA"
# You are recreating what the browser already provides.
# Every attribute you add is a potential bug, a thing to maintain,
# and a thing that might conflict with browser behavior.

# CORRECT mental model: "Start with the right element"
# Semantic HTML is not an accessibility technique.
# It is the DEFAULT. ARIA is the fallback for when HTML is not enough.
```

### Key Semantic Elements and When to Use Them

```
Element              Purpose                    Screen Reader Behavior
──────────           ───────────────────────    ──────────────────────────
<header>             Page or section header      Landmark: "banner"
<nav>                Navigation region           Landmark: "navigation"
<main>               Primary page content        Landmark: "main"
<footer>             Page or section footer      Landmark: "contentinfo"
<aside>              Complementary content        Landmark: "complementary"
<article>            Self-contained content       Landmark: "article"
<section>            Thematic grouping            Landmark: "region" (if labeled)

<h1> - <h6>          Heading hierarchy           Navigate BY heading (H key)
<p>                  Paragraph                   Announced as text
<ul>/<ol>            Lists                       "List of 5 items"
<table>/<th>/<td>    Tabular data                Row/column navigation
<form>               User input                  "Form" landmark
<label>              Input label                 Associates label with input
<button>             Action trigger              "Button: Submit"
<a href="...">       Navigation link             "Link: About Us"
<input>/<select>     Form controls               Type + label announced
<dialog>             Modal dialog                Focus trapping built-in
<details>/<summary>  Expandable content          "Collapsed/expanded"
```

### Button vs Link: A Critical Distinction

This is one of the most commonly violated accessibility patterns:

```svelte
<!-- WRONG: Link styled as button for an action -->
<a href="#" onclick|preventDefault={deleteItem} class="btn">Delete</a>
<!-- Screen reader: "Link: Delete" -- user expects navigation, not an action -->
<!-- Announced wrong, behaves wrong, confuses assistive technology -->

<!-- WRONG: Button that navigates -->
<button onclick={() => goto('/about')}>About Us</button>
<!-- Screen reader: "Button: About Us" -- user expects an action, not navigation -->
<!-- Cannot be opened in a new tab, not announced as a destination -->

<!-- CORRECT: Button for actions, link for navigation -->
<button onclick={deleteItem}>Delete</button>
<a href="/about">About Us</a>
```

The rule is simple: **buttons do things, links go places**. Buttons trigger actions (submit, delete, toggle, open modal). Links navigate to URLs (another page, a section within the page, an external site). Screen readers announce them differently, users have different expectations, and keyboard behavior differs (Enter activates links, Enter AND Space activate buttons).

### Heading Hierarchy: The Invisible Navigation

Screen reader users rely heavily on headings to navigate pages. A proper heading hierarchy is like a table of contents:

```svelte
<!-- WRONG: Headings chosen for visual size, not hierarchy -->
<h1>My Blog</h1>
<h3>Latest Posts</h3>     <!-- Skipped h2! -->
<h5>Post Title</h5>      <!-- Skipped h4! -->
<h2>Sidebar</h2>         <!-- Back to h2 after h5? -->

<!-- CORRECT: Headings reflect document structure -->
<h1>My Blog</h1>
  <h2>Latest Posts</h2>
    <h3>Understanding Accessibility</h3>
    <h3>Building with SvelteKit</h3>
  <h2>Sidebar</h2>
    <h3>Categories</h3>
    <h3>Archives</h3>
```

```
# WRONG: Using headings for visual styling
<h4>This text should be small and bold</h4>
# h4 is a heading level, not a font size. Use CSS instead.

# CORRECT: Headings for structure, CSS for styling
<p class="text-sm font-bold">This text should be small and bold</p>
```

Screen readers let users jump between headings with keyboard shortcuts (H key in NVDA/JAWS). If your headings skip levels or are out of order, this navigation becomes confusing and unreliable. Every page should have exactly one `<h1>`, and subsequent headings should nest logically.

## ARIA: When Native HTML Is Not Enough

ARIA (Accessible Rich Internet Applications) is a set of attributes that add semantic meaning to elements. It was created for situations where native HTML cannot express the interaction pattern -- custom widgets like tab panels, comboboxes, tree views, or live regions.

**The first rule of ARIA: do not use ARIA if a native HTML element can do the job.** ARIA does not add behavior -- it only adds semantics. A `<div role="button">` is announced as a button but still cannot be focused or activated by keyboard without additional code. A real `<button>` does all of that natively.

### ARIA for Custom Widgets

```svelte
<!-- Tab interface (no native HTML equivalent) -->
<script lang="ts">
  let activeTab = $state('details');

  function handleTabKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      activeTab = activeTab === 'details' ? 'reviews' : 'details';
    } else if (event.key === 'ArrowLeft') {
      activeTab = activeTab === 'reviews' ? 'details' : 'reviews';
    }
  }
</script>

<div role="tablist" aria-label="Product information" onkeydown={handleTabKeydown}>
  <button
    role="tab"
    id="tab-details"
    aria-selected={activeTab === 'details'}
    aria-controls="panel-details"
    tabindex={activeTab === 'details' ? 0 : -1}
    onclick={() => activeTab = 'details'}
  >
    Details
  </button>
  <button
    role="tab"
    id="tab-reviews"
    aria-selected={activeTab === 'reviews'}
    aria-controls="panel-reviews"
    tabindex={activeTab === 'reviews' ? 0 : -1}
    onclick={() => activeTab = 'reviews'}
  >
    Reviews
  </button>
</div>

<div
  role="tabpanel"
  id="panel-details"
  aria-labelledby="tab-details"
  hidden={activeTab !== 'details'}
>
  <!-- Details content -->
</div>

<div
  role="tabpanel"
  id="panel-reviews"
  aria-labelledby="tab-reviews"
  hidden={activeTab !== 'reviews'}
>
  <!-- Reviews content -->
</div>
```

Notice the pattern: `aria-selected` communicates state, `aria-controls` links the tab to its panel, `aria-labelledby` gives the panel its accessible name, `tabindex` manages which tab is in the focus order (only the active tab; arrow keys move between tabs), and `hidden` removes inactive panels from the accessibility tree.

### Live Regions: Announcing Dynamic Changes

When content changes dynamically (form validation, notifications, loading states), screen readers need to be told. Live regions handle this:

```svelte
<script lang="ts">
  let message = $state('');
  let isLoading = $state(false);

  async function submitForm() {
    isLoading = true;
    message = 'Submitting your form...';

    try {
      await fetch('/api/submit', { method: 'POST' });
      message = 'Form submitted successfully!';
    } catch {
      message = 'Submission failed. Please try again.';
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- aria-live="polite" waits for the user to pause before announcing -->
<!-- aria-live="assertive" interrupts whatever the screen reader is saying -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  {message}
</div>

<!-- For error messages, use role="alert" (implicitly assertive) -->
{#if formError}
  <div role="alert" class="text-red-600">
    {formError}
  </div>
{/if}
```

```
# WRONG: Changing content without a live region
<p>{statusMessage}</p>
# Screen reader users do not know the text changed.
# They only hear content when they actively navigate to it.

# CORRECT: Using aria-live to announce changes
<p aria-live="polite">{statusMessage}</p>
# Screen reader announces the new text automatically.
# "polite" waits for a pause; "assertive" interrupts immediately.
# Use "assertive" only for urgent messages (errors, alerts).
```

### Common ARIA Attributes Reference

```
Attribute              Purpose                           Example
─────────────────     ───────────────────────────       ──────────────────
aria-label             Accessible name (no visible text) <button aria-label="Close">X</button>
aria-labelledby        References element with name       <div aria-labelledby="heading-id">
aria-describedby       References element with detail     <input aria-describedby="hint-id">
aria-hidden="true"     Hides from accessibility tree      <span aria-hidden="true">decorative</span>
aria-live              Announces dynamic changes          <div aria-live="polite">
aria-expanded          Collapsible section state          <button aria-expanded={isOpen}>
aria-controls          Identifies controlled element      <button aria-controls="menu-id">
aria-selected          Selected state in a group          <li aria-selected={isActive}>
aria-invalid           Input validation state             <input aria-invalid={hasError}>
aria-required          Required field indicator            <input aria-required="true">
aria-disabled          Non-interactive state              <button aria-disabled="true">
role                   Element's semantic role            <div role="tablist">
```

### Hiding Content: Visually vs Semantically

Sometimes you need content visible to screen readers but not sighted users (or vice versa):

```svelte
<!-- Visually hidden but available to screen readers (use Tailwind's sr-only) -->
<span class="sr-only">4 out of 5 stars</span>

<!-- Hidden from screen readers but visually present (decorative) -->
<span aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9734;</span>

<!-- For custom implementations without Tailwind: -->
<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
```

```
# WRONG: Using display:none to "hide" screen reader text
<span style="display:none">4 out of 5 stars</span>
# display:none hides from EVERYONE, including screen readers.

# WRONG: Using visibility:hidden
<span style="visibility:hidden">4 out of 5 stars</span>
# Also hidden from screen readers. Takes up space in layout too.

# CORRECT: Using the sr-only pattern
<span class="sr-only">4 out of 5 stars</span>
# Visually hidden, still announced by screen readers.
# The element exists in the accessibility tree.
```

## Keyboard Navigation and Focus Management

Keyboard accessibility is non-negotiable. Every interactive element must be reachable and operable via keyboard:

- **Tab** moves forward through focusable elements; **Shift+Tab** moves backward
- **Enter** activates links and buttons; **Space** activates buttons and toggles checkboxes
- **Escape** closes modals, dropdowns, and popovers
- **Arrow keys** navigate within composite widgets (tabs, menus, radio groups)

### Focus Order Must Match Visual Order

```svelte
<!-- WRONG: CSS visually reorders elements, but tab order follows DOM -->
<div class="flex flex-row-reverse">
  <button>Third visually, first in tab order</button>
  <button>Second visually, second in tab order</button>
  <button>First visually, third in tab order</button>
</div>
<!-- User sees: [First] [Second] [Third] -->
<!-- Tab order: Third -> Second -> First (confusing!) -->

<!-- CORRECT: DOM order matches visual order -->
<div class="flex">
  <button>First</button>
  <button>Second</button>
  <button>Third</button>
</div>
```

```
# WRONG: Using positive tabindex to "fix" focus order
<button tabindex="3">Third</button>
<button tabindex="1">First</button>
<button tabindex="2">Second</button>
# Positive tabindex creates maintenance nightmares.
# Every new element needs a carefully chosen number.

# CORRECT: Only use tabindex="0" or tabindex="-1"
# tabindex="0": Focusable in natural DOM order
# tabindex="-1": Focusable only via JavaScript (programmatic focus)
# Never use tabindex > 0
```

### Focus Indicators: Making Focus Visible

Users who navigate with a keyboard must be able to see which element has focus. Removing focus indicators is one of the worst accessibility violations:

```css
/* WRONG: Removing focus outlines globally */
*:focus {
  outline: none;
}
/* Keyboard users are now navigating blind. They have no idea
   which element is active. This is like removing the cursor. */

/* CORRECT: Custom focus styles that are visible */
*:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
/* :focus-visible only shows for keyboard navigation, not mouse clicks.
   This gives keyboard users clear indicators without affecting
   the visual experience for mouse users. */
```

### Focus Management in Dynamic UIs

When your UI changes dynamically -- modals opening, content loading, items being deleted -- focus management becomes critical:

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

```
# WRONG: Building a modal with a div
<div class="modal" style="position:fixed; z-index:999">
  <!-- No focus trap: Tab escapes to the page behind -->
  <!-- No Escape handling: keyboard users are stuck -->
  <!-- No inert: page behind remains interactive -->
  <!-- You must build ALL of this from scratch -->
</div>

# CORRECT: Using the native <dialog> element
<dialog>
  <!-- Focus trapping: Tab cycles inside the dialog -->
  <!-- Escape key: closes the dialog automatically -->
  <!-- Backdrop: ::backdrop pseudo-element, styled with CSS -->
  <!-- Inert: content behind the dialog is non-interactive -->
  <!-- All of this for free. Zero JavaScript needed for these behaviors. -->
</dialog>
```

### Skip Links: Bypassing Repetitive Navigation

Screen reader and keyboard users should not have to Tab through your entire navigation on every page load:

```svelte
<!-- First element in body -- visually hidden until focused -->
<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:p-2 focus:text-blue-600 focus:underline"
>
  Skip to main content
</a>

<nav>
  <!-- 15 navigation links that keyboard users would otherwise Tab through -->
</nav>

<main id="main-content" tabindex="-1">
  <!-- tabindex="-1" allows programmatic focus but does not add to tab order -->
  <h1>Page Content</h1>
</main>
```

## Color Contrast

Insufficient color contrast is one of the most common accessibility failures. WCAG defines minimum ratios:

- **AA**: 4.5:1 contrast ratio for normal text, 3:1 for large text (18px bold or 24px regular)
- **AAA**: 7:1 contrast ratio for normal text, 4.5:1 for large text

### Never Rely on Color Alone

Color alone must never be the only way to convey information. If an error state is only indicated by red text, a colorblind user misses it:

```svelte
<!-- WRONG: Color alone indicates error state -->
<input class="border-red-500" />
<p class="text-red-600">Email is required</p>
<!-- A colorblind user sees no difference between this and normal state -->

<!-- CORRECT: Color + icon + role + explicit association -->
<input
  class="border-red-500"
  aria-describedby="email-error"
  aria-invalid="true"
/>
<p id="email-error" class="text-red-600" role="alert">
  <span aria-hidden="true">&#9888;</span> Please enter a valid email address
</p>
```

```svelte
<!-- WRONG: Status communicated only by color -->
<span class="text-green-600">&#9679;</span>
<span class="text-red-600">&#9679;</span>
<!-- What do these dots mean? Color alone is not enough. -->

<!-- CORRECT: Status communicated by text AND color -->
<span class="text-green-600">
  <span aria-hidden="true">&#9679;</span> Active
</span>
<span class="text-red-600">
  <span aria-hidden="true">&#9679;</span> Inactive
</span>
```

### Contrast in Tailwind CSS v4

When defining your design tokens with Tailwind v4's `@theme` directive, verify contrast ratios:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  /* Text on white (#ffffff) backgrounds */
  --color-text-primary: #111827;     /* ~16:1 ratio -- excellent */
  --color-text-secondary: #4b5563;   /* ~7:1 ratio -- AAA pass */
  --color-text-muted: #6b7280;       /* ~4.6:1 ratio -- AA pass */
  --color-text-disabled: #9ca3af;    /* ~3:1 ratio -- FAILS AA for normal text */
}
```

Tools to check contrast: Chrome DevTools (inspect element, look at the contrast ratio), the WebAIM Contrast Checker, and the axe browser extension.

## Accessible Forms

Forms are where accessibility failures are most impactful -- they are the primary way users interact with your application:

```svelte
<!-- WRONG: Input without a label -->
<input type="email" placeholder="Email address" />
<!-- Screen reader: "edit text" -- the user does not know what to type -->
<!-- When the user starts typing, the placeholder disappears as a hint -->

<!-- CORRECT: Input with associated label -->
<label for="email">Email address</label>
<input id="email" type="email" placeholder="alice@example.com" />
<!-- Screen reader: "Email address, edit text" -->
<!-- The label is always visible, even after typing -->
```

### Complete Accessible Form Pattern

```svelte
<script lang="ts">
  let email = $state('');
  let password = $state('');
  let errors = $state<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    if (password.length < 12) newErrors.password = 'Password must be at least 12 characters';
    errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    if (validate()) { /* submit */ }
  }}
  novalidate
  aria-label="Sign up form"
>
  <div>
    <label for="signup-email">
      Email address
      <span aria-hidden="true" class="text-red-500">*</span>
    </label>
    <input
      id="signup-email"
      type="email"
      bind:value={email}
      required
      aria-required="true"
      aria-invalid={!!errors.email}
      aria-describedby={errors.email ? 'email-error' : undefined}
    />
    {#if errors.email}
      <p id="email-error" role="alert" class="text-red-600 text-sm">
        {errors.email}
      </p>
    {/if}
  </div>

  <div>
    <label for="signup-password">
      Password
      <span aria-hidden="true" class="text-red-500">*</span>
    </label>
    <input
      id="signup-password"
      type="password"
      bind:value={password}
      required
      aria-required="true"
      aria-invalid={!!errors.password}
      aria-describedby="password-hint {errors.password ? 'password-error' : ''}"
    />
    <p id="password-hint" class="text-sm text-gray-600">
      Must be at least 12 characters
    </p>
    {#if errors.password}
      <p id="password-error" role="alert" class="text-red-600 text-sm">
        {errors.password}
      </p>
    {/if}
  </div>

  <button type="submit">Create Account</button>
</form>
```

Key patterns:
- Every input has a visible `<label>` with matching `for`/`id`
- Required fields use both `required` and `aria-required="true"`
- Invalid fields use `aria-invalid` to communicate state
- Error messages use `role="alert"` and are linked via `aria-describedby`
- Help text (password hint) is also linked via `aria-describedby`
- The `*` indicator uses `aria-hidden` because the requirement is communicated via `aria-required`

## Reduced Motion

Users with vestibular disorders can experience physical discomfort from animations. Respect the `prefers-reduced-motion` media query:

```svelte
<script lang="ts">
  import { Tween } from 'svelte/motion';

  // Check user preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const progress = new Tween(0, {
    duration: prefersReducedMotion ? 0 : 400,
  });
</script>

<style>
  /* CSS approach: disable transitions for users who prefer reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
</style>
```

```
# WRONG: Ignoring motion preferences entirely
.card {
  transition: transform 0.5s ease;
}
.card:hover {
  transform: scale(1.1) rotate(5deg);
}

# CORRECT: Providing a reduced-motion alternative
.card {
  transition: transform 0.3s ease;
}
.card:hover {
  transform: scale(1.02);
}
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
```

## Svelte's Built-in a11y Warnings

Svelte's compiler includes accessibility checks that catch common mistakes at build time. If you write an `<img>` without an `alt` attribute, Svelte warns you. If you put a click handler on a non-interactive element without a keyboard equivalent, Svelte warns you.

These warnings cover:

- Missing `alt` attributes on images
- Click handlers on non-interactive elements without keyboard handlers
- Missing form labels
- Autofocus misuse
- Redundant ARIA roles (like `role="button"` on a `<button>`)
- Missing `aria-` attribute values
- Invalid ARIA attribute values

```svelte
<!-- Svelte warns: A11y: <img> element should have an alt attribute -->
<img src="/photo.jpg" />

<!-- Svelte warns: visible non-interactive element with onclick needs keyboard event -->
<div onclick={handleClick}>Click me</div>

<!-- No warning: correct semantic element -->
<button onclick={handleClick}>Click me</button>

<!-- No warning: img with alt -->
<img src="/photo.jpg" alt="A golden retriever playing in the park" />
```

These warnings are not exhaustive -- they catch the low-hanging fruit. But they are a powerful first line of defense that most other frameworks do not offer. **Do not ignore them.** Each warning represents a real barrier for a real user.

```
# WRONG: Suppressing a11y warnings without fixing the issue
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div onclick={handleClick}>Click me</div>
# You silenced the warning but the barrier remains.
# A keyboard user STILL cannot activate this element.

# CORRECT: Fix the issue, eliminate the warning
<button onclick={handleClick}>Click me</button>
# No warning to suppress. The element is inherently accessible.
```

## Alt Text Best Practices

Every `<img>` needs an `alt` attribute. The question is what to put in it:

```svelte
<!-- Informative image: describe what it shows AND its purpose -->
<img src="/chart.png" alt="Sales increased 40% from January to March 2024" />

<!-- Decorative image: use empty alt (NOT missing alt) -->
<img src="/divider.png" alt="" />

<!-- Link image: describe the destination, not the image -->
<a href="/home">
  <img src="/logo.png" alt="Acme Store home page" />
</a>

<!-- Icon button: label describes the action, icon is decorative -->
<button aria-label="Delete item">
  <img src="/trash-icon.svg" alt="" />
</button>

<!-- Complex image: use aria-describedby for long descriptions -->
<figure>
  <img
    src="/architecture.png"
    alt="System architecture diagram"
    aria-describedby="arch-desc"
  />
  <figcaption id="arch-desc">
    The client sends requests to the API gateway, which routes to
    microservices A, B, and C. Each service connects to its own database.
  </figcaption>
</figure>
```

Write alt text that conveys the **purpose** of the image, not just what it looks like. "Photo of a dog" is less useful than "Golden retriever playing fetch in the park." An empty `alt=""` is correct for decorative images -- it tells screen readers to skip the element entirely. A missing `alt` attribute (no attribute at all) causes screen readers to read the file name, which is useless.

```
# WRONG alt text:
alt="image"           # Useless -- adds no information
alt="photo.jpg"       # Screen reader already knows it is an image
alt="click here"      # Describes action, not the image content
alt="banner"          # What does the banner show?

# CORRECT alt text:
alt="Team photo: five engineers standing in front of the office"
alt=""                 # Decorative -- correctly signals "skip this"
alt="Error: invalid email address"  # For an error icon
alt="Download the annual report (PDF, 2.4MB)"  # Download link image
```

## Building Accessible Svelte Components

Here is a complete pattern for an accessible accordion component in Svelte 5:

```svelte
<!-- $lib/components/ui/Accordion.svelte -->
<script lang="ts">
  interface AccordionItem {
    id: string;
    title: string;
  }

  interface Props {
    items: AccordionItem[];
    children: import('svelte').Snippet<[AccordionItem, boolean]>;
  }

  let { items, children }: Props = $props();
  let openItems = $state<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(openItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    openItems = next;
  }
</script>

<div class="divide-y">
  {#each items as item (item.id)}
    {@const isOpen = openItems.has(item.id)}
    <div>
      <h3>
        <button
          id="accordion-header-{item.id}"
          aria-expanded={isOpen}
          aria-controls="accordion-panel-{item.id}"
          class="flex w-full items-center justify-between p-4 text-left font-medium"
          onclick={() => toggle(item.id)}
        >
          <span>{item.title}</span>
          <span
            aria-hidden="true"
            class="transform transition-transform"
            class:rotate-180={isOpen}
          >
            &#9662;
          </span>
        </button>
      </h3>
      <div
        id="accordion-panel-{item.id}"
        role="region"
        aria-labelledby="accordion-header-{item.id}"
        hidden={!isOpen}
      >
        <div class="p-4">
          {@render children(item, isOpen)}
        </div>
      </div>
    </div>
  {/each}
</div>
```

This accordion follows the WAI-ARIA accordion pattern: trigger buttons inside headings, `aria-expanded` for state, `aria-controls` linking trigger to panel, `role="region"` with `aria-labelledby` for panels, and `hidden` to remove collapsed panels from the tree.

## Testing Accessibility

Building accessible software requires testing with the same rigor you apply to functionality:

### 1. Keyboard Testing

Unplug your mouse and try to complete every user flow:

```
Checklist:
[ ] Can you reach every interactive element with Tab?
[ ] Can you see which element has focus? (visible focus indicator)
[ ] Can you activate buttons with Enter and Space?
[ ] Can you follow links with Enter?
[ ] Can you escape modals with Escape?
[ ] Does focus return to the trigger when a modal closes?
[ ] Can you use arrow keys in tabs, menus, and radio groups?
[ ] Is the tab order logical? (left-to-right, top-to-bottom)
[ ] Does the skip link work? (if you have one)
```

### 2. Screen Reader Testing

Try VoiceOver (Mac), NVDA (Windows, free), or Orca (Linux):

```
VoiceOver quick start (Mac):
1. Press Cmd + F5 to enable VoiceOver
2. Use VO keys (Ctrl + Option) + arrows to navigate
3. Press VO + U for the rotor (headings, landmarks, links)
4. Press Tab to jump between interactive elements
5. Press Cmd + F5 again to disable

Listen for:
- Are headings announced in the correct order?
- Do buttons and links have meaningful names?
- Are form inputs associated with their labels?
- Are dynamic changes (errors, notifications) announced?
- Do images have useful alt text or are they correctly hidden?
```

### 3. Automated Testing with axe-core

```typescript
// In a Playwright test
import AxeBuilder from '@axe-core/playwright';

test('home page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Test after interaction (error states, dynamic content)
test('login form is accessible after validation', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'invalid');
  await page.click('button[type="submit"]');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Test specific WCAG levels
test('meets WCAG AA standards', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

### 4. Browser DevTools

- **Chrome DevTools > Lighthouse > Accessibility** -- score and suggestions
- **Chrome DevTools > Elements > Accessibility pane** -- inspect the accessibility tree
- **axe DevTools browser extension** -- in-page auditing with detailed explanations

Automated tools catch roughly 30-50% of accessibility issues. The rest require manual testing. A passing Lighthouse score does not mean your app is accessible -- it means you have avoided the most obvious mistakes.

## Try It

1. **Audit your page**: Take one of your existing Svelte pages. Replace any `<div>` elements that should be semantic elements (`<nav>`, `<main>`, `<header>`, `<footer>`). Add missing `alt` attributes. Ensure headings follow a logical h1 > h2 > h3 order. Add `aria-label` to any icon-only buttons.

2. **Build an accessible modal**: Create a modal using the native `<dialog>` element. Verify that: focus moves into the modal when it opens, Tab cycles only through elements inside the modal (focus trapping), Escape closes it, and focus returns to the trigger button when it closes. Add `aria-labelledby` pointing to the modal's heading.

3. **Build an accessible form**: Create a signup form with email, password, and submit button. Add visible labels, `aria-required` for required fields, `aria-invalid` and `aria-describedby` for validation errors, and `role="alert"` for error messages. Test with a screen reader.

4. **Install the axe browser extension** and run it on your app. Fix every issue it reports. Then navigate your entire app using only the keyboard. Note every place you get stuck and fix it.

5. **Add reduced motion support**: If you have any animations or transitions, wrap them with `prefers-reduced-motion` media queries. Test by enabling "Reduce motion" in your OS accessibility settings. Use `new Tween()` from `svelte/motion` with duration 0 when reduced motion is preferred.

6. **Write an automated test**: Add a Playwright test that runs axe-core against your home page and asserts zero violations. Run it as part of your CI/CD pipeline.

## Key Takeaways

- Accessibility is a **legal requirement** in many jurisdictions and a fundamental quality of well-engineered software -- it is not optional
- Disability exists on a **spectrum** (permanent, temporary, situational) -- accessible design helps everyone, not just "disabled people"
- **Semantic HTML** is the foundation -- the right element gives you accessibility for free; a `<div>` gives you nothing and requires 7+ extra attributes to replicate basic button behavior
- **Buttons do things, links go places** -- confusing them breaks screen reader expectations and keyboard behavior
- **Heading hierarchy** (h1 > h2 > h3, never skip levels) is how screen reader users navigate your page -- use CSS for visual styling, headings for structure
- **ARIA** fills gaps when native HTML is insufficient -- but the first rule of ARIA is "do not use ARIA if native HTML can do the job"
- **Focus management** is critical for dynamic UIs -- modals need focus trapping and focus restoration; use the native `<dialog>` element for free accessibility
- **Focus indicators** must be visible -- never globally remove `:focus` outlines; use `:focus-visible` for keyboard-only styles
- **Never rely on color alone** to convey information -- pair color with icons, text labels, or patterns
- **Color contrast** must meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- **Forms** need visible labels, `aria-required`, `aria-invalid`, and `aria-describedby` linking to error messages with `role="alert"`
- **Reduced motion** must be respected via `prefers-reduced-motion` -- use `new Tween()` with duration 0 when the preference is set
- Svelte's compiler catches common a11y mistakes at build time -- **never suppress these warnings** without fixing the underlying issue
- **Automated tools catch 30-50%** of issues; keyboard testing and screen reader testing catch the rest
- Use `tabindex="0"` for natural tab order and `tabindex="-1"` for programmatic focus -- **never use positive tabindex values**
- **Skip links** let keyboard users bypass repetitive navigation
- **Live regions** (`aria-live`, `role="alert"`, `role="status"`) announce dynamic content changes to screen reader users
