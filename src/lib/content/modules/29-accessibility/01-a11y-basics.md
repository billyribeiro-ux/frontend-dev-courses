# Accessibility Basics

Accessibility (often shortened to **a11y**) means building websites that everyone can use, including people who navigate with a keyboard, use screen readers, have low vision, or experience cognitive differences. This is not an optional feature you bolt on before launch. It is a fundamental quality of well-engineered software, in the same way that security or performance is. You would never ship a product without authentication. You should never ship one without accessibility either.

Over one billion people worldwide live with some form of disability. When you skip accessibility, you exclude real users from your app. But the moral argument is only half the story. In many jurisdictions, accessibility is a **legal requirement**. The Americans with Disabilities Act (ADA) in the US, the European Accessibility Act (EAA) in the EU, and similar laws in Canada, the UK, Australia, and elsewhere all require digital products to be accessible. Lawsuits over inaccessible websites have grown year over year — over 4,000 ADA-related web accessibility lawsuits were filed in the US in 2023 alone. This is not a theoretical risk — it is happening to companies of every size right now.

The good news: most accessibility improvements also make your site better for **everyone**. Keyboard navigation helps power users. Good color contrast helps people using their phone in sunlight. Captions help anyone watching video in a noisy cafe. Proper heading structure helps SEO. Form labels help all users understand what to enter. Accessibility is not a zero-sum game — it is a rising tide that lifts all boats.

## The Mental Model: How People Use the Web Differently

To build accessible software, you need to understand how different people experience your UI. Accessibility is not about one group of users — it is about the full spectrum of human interaction with technology.

### Visual Disabilities

**Blind users** rely entirely on screen readers (VoiceOver on Mac/iOS, NVDA and JAWS on Windows, TalkBack on Android, Orca on Linux). A screen reader converts the visual interface into an auditory experience — it reads the page content aloud, announces interactive elements, and provides keyboard shortcuts for navigation. Blind users never see your layout, your colors, or your animations. They experience a linear stream of semantic information derived from your HTML structure.

**Low-vision users** may use screen magnification (zooming to 200-400%), high-contrast modes, custom color schemes, or screen readers in combination with some visual capability. If your layout breaks at high zoom, if text is embedded in images, or if critical information relies solely on small visual cues, these users lose access.

**Color-blind users** (about 8% of men and 0.5% of women) cannot distinguish certain color combinations. Red/green color blindness is most common — a red error message next to a green success message looks identical to them. Never rely on color alone to convey information.

### Motor Disabilities

**Keyboard-only users** navigate entirely with Tab, Shift+Tab, Enter, Space, and arrow keys. They cannot use a mouse. This includes people with paralysis, tremors, missing limbs, or repetitive strain injury, as well as power users who prefer keyboard for speed. If a control cannot receive focus or does not respond to keyboard events, it is inaccessible.

**Switch users** operate a single button (or a few buttons) to scan through and select interface elements. Their interaction is even more constrained than keyboard — they rely on focus order being logical and complete.

**Voice control users** (Dragon NaturallySpeaking, Voice Control on Mac/iOS) speak commands like "click Submit" or "press Tab." They need visible labels that match the accessible name of each element.

### Auditory Disabilities

**Deaf and hard-of-hearing users** cannot access audio content without captions or transcripts. Video content without captions excludes them entirely. Audio-only notifications (like a beep for errors) must have visual alternatives.

### Cognitive and Neurological Differences

**Users with ADHD** benefit from clear visual hierarchy, reduced clutter, and the ability to focus without distracting animations.

**Users with dyslexia** benefit from adequate line height, sufficient font size, and layouts that do not require tracking across wide columns.

**Users with autism** benefit from predictable navigation, consistent interaction patterns, and plain language.

**Users with vestibular disorders** (affecting balance and spatial orientation) can experience nausea, dizziness, or migraines from parallax scrolling, auto-playing animations, rapid transitions, or flashing content. The `prefers-reduced-motion` media query exists specifically for them:

```css
/* Respect the user's motion preference */
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
```

**Users with epilepsy** can have seizures triggered by flashing content. WCAG requires that content does not flash more than three times per second.

The key insight: you are not building "for disabled people." You are building for **all the ways people use the web**. Your future self with a broken arm, your colleague in a noisy open office, your user on a slow connection in bright sunlight — they all benefit from accessible design.

## The Accessibility Tree: What Assistive Technologies Actually See

Every browser builds two parallel representations of your page. The first is the **DOM tree** — the complete HTML structure that drives rendering. The second is the **accessibility tree** — a simplified version of the DOM that contains only the information assistive technologies need: names, roles, states, relationships, and descriptions.

Understanding the accessibility tree is the single biggest mental model upgrade you can make as a developer. When you write HTML, you are not just painting pixels — you are constructing a semantic representation that machines will interpret.

```svelte
<!-- Your HTML -->
<nav aria-label="Main">
  <a href="/products">Products</a>
  <button aria-expanded="false" aria-controls="user-menu">
    Account
  </button>
</nav>

<!-- What the accessibility tree sees -->
<!--
  navigation "Main"
    link "Products"
      text "Products"
    button "Account"
      expanded: false
      controls: user-menu
-->
```

The accessibility tree strips away all visual styling. It does not know about your CSS grid, your colors, or your border radius. It only knows semantics: "this is a navigation landmark called Main, containing a link named Products and a button named Account that controls something and is currently collapsed."

You can inspect the accessibility tree directly:

- **Chrome DevTools**: Elements panel > Accessibility tab, or the dedicated Accessibility panel
- **Firefox DevTools**: Accessibility tab in the inspector (shows the full tree with roles and properties)
- **Safari**: Web Inspector > Elements > Node > Accessibility section

Inspecting the accessibility tree should be as routine as inspecting the DOM. If you cannot see an element in the accessibility tree, screen readers cannot see it either.

### How the Accessible Name Is Computed

Every interactive element needs an **accessible name** — the text that a screen reader announces. The browser computes this name using a specific algorithm (the Accessible Name and Description Computation spec), and understanding the priority order prevents bugs:

```svelte
<!-- Priority 1: aria-labelledby (references another element's text) -->
<button aria-labelledby="btn-label">
  <svg aria-hidden="true"><!-- icon --></svg>
</button>
<span id="btn-label" class="sr-only">Close dialog</span>
<!-- Accessible name: "Close dialog" -->

<!-- Priority 2: aria-label (inline string) -->
<button aria-label="Close dialog">
  <svg aria-hidden="true"><!-- icon --></svg>
</button>
<!-- Accessible name: "Close dialog" -->

<!-- Priority 3: Text content (direct child text or alt text) -->
<button>Save Changes</button>
<!-- Accessible name: "Save Changes" -->

<!-- Priority 4: title attribute (lowest priority, avoid relying on this) -->
<button title="Save Changes">
  <svg><!-- icon --></svg>
</button>
<!-- Accessible name: "Save Changes" — but tooltips are inaccessible to many users -->
```

A common mistake is setting both `aria-label` and visible text content, then changing one but not the other. The `aria-label` wins, so the screen reader announces something different from what sighted users see. This creates a disconnect that confuses voice control users, who say "click Save" when the button actually has `aria-label="Submit form"`.

```svelte
<!-- WRONG: visible text says "Save" but aria-label says something else -->
<button aria-label="Submit form for processing">Save</button>

<!-- CORRECT: aria-label matches or is absent when visible text is sufficient -->
<button>Save</button>
```

## WCAG Guidelines: The Standard Explained

The **Web Content Accessibility Guidelines (WCAG)** are the international standard for web accessibility. The current version is WCAG 2.2 (published in October 2023), though WCAG 2.1 Level AA is still the most commonly referenced legal standard.

### The Four Principles: POUR

WCAG is organized around four principles:

**1. Perceivable** — Users must be able to perceive the content through at least one of their senses.
- Text alternatives for images (`alt` attributes)
- Captions and transcripts for audio/video
- Content can be presented in different ways without losing meaning (responsive design, zoom support)
- Sufficient color contrast between text and background
- Content is not solely conveyed through color, shape, or position

**2. Operable** — Users must be able to operate the interface.
- All functionality is available from a keyboard
- Users have enough time to read and use content (no auto-expiring content without warning)
- Content does not flash in ways that could cause seizures
- Navigation mechanisms are consistent and predictable
- Users can find content through multiple methods (search, sitemap, navigation)

**3. Understandable** — Content and operation must be understandable.
- Text is readable and understandable (clear language, defined abbreviations)
- Content appears and operates in predictable ways (consistent navigation, no unexpected changes)
- Users are helped to avoid and correct mistakes (clear error messages, input validation)

**4. Robust** — Content must work with current and future assistive technologies.
- Valid HTML that assistive technologies can parse
- Custom components communicate their name, role, and state
- Status messages are communicated to assistive technologies without receiving focus

### Conformance Levels

- **Level A**: The absolute minimum. Failing Level A means major barriers exist (images without alt text, no keyboard access, auto-playing audio).
- **Level AA**: The standard target for most websites and the level required by most accessibility laws. Includes color contrast requirements, visible focus indicators, and error identification.
- **Level AAA**: The highest level. Includes enhanced contrast ratios, sign language interpretation for video, and more. Aspirational for most projects but worth pursuing for critical content.

**Aim for WCAG 2.2 Level AA** as your baseline. This is what legal requirements reference and what accessibility audits evaluate.

### New in WCAG 2.2

WCAG 2.2 added several new success criteria that are particularly relevant to modern web apps:

- **2.4.11 Focus Not Obscured (Minimum)** (AA): When a component receives keyboard focus, it must not be entirely hidden behind other content like sticky headers or cookie banners. This is a common failure in apps with fixed positioning.
- **2.4.13 Focus Appearance** (AAA): Focus indicators must have a minimum area and contrast ratio.
- **2.5.7 Dragging Movements** (AA): Any functionality that uses dragging must also provide a single-pointer alternative. This directly affects drag-and-drop interfaces.
- **2.5.8 Target Size (Minimum)** (AA): Interactive targets must be at least 24x24 CSS pixels, with specific spacing rules.
- **3.3.7 Redundant Entry** (A): Information previously entered by the user must be auto-populated or available for selection when needed again.
- **3.3.8 Accessible Authentication (Minimum)** (AA): Authentication processes must not require cognitive function tests (like CAPTCHA) without an accessible alternative.

```svelte
<!-- WRONG: drag-and-drop with no alternative (violates 2.5.7) -->
<div
  role="listbox"
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  {#each items as item}
    <div draggable="true" ondragstart={(e) => handleDragStart(e, item)}>
      {item.name}
    </div>
  {/each}
</div>

<!-- CORRECT: drag-and-drop WITH button-based reorder alternative -->
<ul role="listbox" aria-label="Task list">
  {#each items as item, index (item.id)}
    <li
      role="option"
      draggable="true"
      ondragstart={(e) => handleDragStart(e, item)}
    >
      <span>{item.name}</span>
      <div class="reorder-controls">
        <button
          aria-label="Move {item.name} up"
          onclick={() => moveItem(index, index - 1)}
          disabled={index === 0}
        >
          Up
        </button>
        <button
          aria-label="Move {item.name} down"
          onclick={() => moveItem(index, index + 1)}
          disabled={index === items.length - 1}
        >
          Down
        </button>
      </div>
    </li>
  {/each}
</ul>
```

## Semantic HTML: The Foundation of Accessibility

The single most impactful thing you can do for accessibility is use the correct HTML elements. Semantic HTML communicates meaning to assistive technologies **for free**. A `<button>` announces itself as interactive, is focusable, responds to Enter and Space, can be found by screen reader users scanning for controls, and is included in the accessibility tree. A `<div>` with an `onclick` does none of these things — you would have to manually add `role="button"`, `tabindex="0"`, keyboard event handlers for Enter and Space, focus styles, and ensure it appears in the accessibility tree. Why rebuild what the platform gives you?

### The Cost of Div Soup

```svelte
<!-- WRONG: "div soup" — invisible to assistive technology, no keyboard support -->
<div class="nav">
  <div class="nav-item" onclick={goHome}>Home</div>
  <div class="nav-item" onclick={goAbout}>About</div>
</div>
<div class="heading">Welcome to Our Site</div>
<div class="content">
  <div class="card" onclick={openDetails}>
    <div class="card-title">Product Name</div>
    <div class="card-price">$29.99</div>
    <div class="btn" onclick={addToCart}>Add to Cart</div>
  </div>
</div>
```

This code looks fine visually but is a wall of meaningless `<div>` elements to a screen reader. A screen reader user hears... nothing useful. They cannot navigate by headings (there are none). They cannot scan for links or buttons (there are none). They cannot operate the "buttons" with a keyboard (divs are not focusable). The entire interface is invisible.

```svelte
<!-- CORRECT: semantic elements — accessible by default -->
<nav aria-label="Main navigation">
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>
<h1>Welcome to Our Site</h1>
<main>
  <article>
    <h2>Product Name</h2>
    <p>$29.99</p>
    <button onclick={addToCart}>Add to Cart</button>
  </article>
</main>
```

A screen reader user now hears: "Main navigation, landmark. Home, link. About, link. Welcome to Our Site, heading level 1. Main, landmark. Product Name, heading level 2. $29.99. Add to Cart, button." They can navigate by landmarks, headings, and interactive elements. Every control is keyboard-accessible. The structure communicates meaning.

### Complete Semantic Element Reference

**Page landmarks** — screen readers provide shortcut keys to jump between these:
- `<header>` — the site header (logo, navigation). Use once per page or once per `<article>`.
- `<nav>` — navigation regions. Use `aria-label` if you have multiple: `<nav aria-label="Main">`, `<nav aria-label="Footer">`.
- `<main>` — the primary content area. Only one per page. Screen readers can jump directly to `<main>`.
- `<aside>` — tangentially related content (sidebars, related articles).
- `<footer>` — site footer (copyright, secondary links).
- `<section>` — a thematic grouping of content. Always give it a heading or `aria-label`.

**Headings** — the skeleton of your page:
- `<h1>` through `<h6>` — heading hierarchy. **Never skip levels.** Do not go from `<h1>` to `<h3>` because `<h2>` "looks too big." Style with CSS, structure with HTML.
- Screen reader users navigate by headings constantly — it is their equivalent of scanning a page visually. A page without proper headings is like a book without a table of contents.

**Interactive elements:**
- `<button>` — for actions that happen on the current page (submit, toggle, open modal). Focusable, activates with Enter and Space.
- `<a href="...">` — for navigation to a URL. Focusable, activates with Enter. Screen readers announce "link."
- **The rule:** If it goes somewhere, use `<a>`. If it does something, use `<button>`. Never use `<a>` without an `href` as a button substitute. Never use `<div onclick>` for either.

**Forms:**
- `<form>` — wraps a set of related inputs. Enables native form submission and screen reader form mode.
- `<label>` — associates text with an input. Screen readers read the label when the input receives focus. **Every input needs a label.**
- `<fieldset>` + `<legend>` — groups related inputs with a group label (e.g., a set of radio buttons).
- `<input>`, `<select>`, `<textarea>` — native form controls with built-in keyboard behavior and ARIA semantics.

```svelte
<!-- WRONG: no label association -->
<div>Email</div>
<input type="email" />

<!-- CORRECT: label via for/id -->
<label for="email">Email</label>
<input type="email" id="email" />

<!-- ALSO CORRECT: label via nesting (simpler, no id needed) -->
<label>
  Email
  <input type="email" />
</label>

<!-- CORRECT: radio group with fieldset -->
<fieldset>
  <legend>Notification preference</legend>
  <label><input type="radio" name="notify" value="email" /> Email</label>
  <label><input type="radio" name="notify" value="sms" /> SMS</label>
  <label><input type="radio" name="notify" value="none" /> None</label>
</fieldset>
```

**Lists:**
- `<ul>` / `<ol>` / `<li>` — screen readers announce "list of 5 items," helping users understand the structure. Use lists for navigation menus, search results, and any collection of related items.

**Tables:**
- `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>` — for tabular data. Screen readers announce row and column headers, allowing users to navigate cells and understand context. **Never use tables for layout.**
- Use `scope="col"` or `scope="row"` on `<th>` to clarify header associations.

```svelte
<table>
  <caption>Quarterly Sales by Region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Q1</th>
      <th scope="col">Q2</th>
      <th scope="col">Q3</th>
      <th scope="col">Q4</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">North</th>
      <td>$1.2M</td>
      <td>$1.4M</td>
      <td>$1.1M</td>
      <td>$1.5M</td>
    </tr>
  </tbody>
</table>
```

### Heading Structure Audit: A Practical Technique

A quick way to audit any page's accessibility is to extract just the headings and see if they form a coherent outline:

```
WRONG heading structure:
  h1: Our Products
  h3: Electronics        ← skipped h2
  h4: Smartphones        ← skipped from h3 to h4 inconsistently
  h2: Featured           ← jumped back up to h2
  h4: Sale Items         ← skipped h3

CORRECT heading structure:
  h1: Our Products
  h2: Electronics
    h3: Smartphones
    h3: Laptops
  h2: Featured
    h3: Sale Items
    h3: New Arrivals
```

If you read only the headings, can you understand the page's structure? That is what screen reader users experience when they use heading navigation (the H key in NVDA, VO+Command+H in VoiceOver). The heading structure IS the table of contents.

## ARIA: When Native HTML Is Not Enough

ARIA (Accessible Rich Internet Applications) is a set of attributes that add semantic meaning to elements. It was created for situations where native HTML cannot express the interaction pattern — custom widgets like tab panels, comboboxes, tree views, carousels, or live-updating regions.

### The Five Rules of ARIA

The W3C defines five rules for ARIA usage, and understanding all five prevents the most common mistakes:

**Rule 1: Do not use ARIA if a native HTML element can do the job.** ARIA does not add behavior — it only adds semantics. A `<div role="button">` is announced as a button but still cannot be focused or activated by keyboard without additional code. A real `<button>` does all of that natively.

**Rule 2: Do not change native semantics unless you have to.** Do not add `role="heading"` to an `<h2>` — it already has that role. Do not add `role="link"` to an `<a>` — it is already a link. Redundant ARIA is harmless in some cases but signals confusion about the element's purpose.

**Rule 3: All interactive ARIA controls must be usable with a keyboard.** If you set `role="button"` on a `<span>`, you MUST also handle Enter and Space keypress events, add `tabindex="0"`, and manage focus.

**Rule 4: Do not use `role="presentation"` or `aria-hidden="true"` on focusable elements.** Hiding an element from the accessibility tree while leaving it focusable creates a "ghost" — keyboard users can reach it but screen readers cannot announce it.

**Rule 5: All interactive elements must have an accessible name.** Every button, link, input, and custom control needs a name that assistive technology can announce.

Bad ARIA is worse than no ARIA. Incorrect ARIA attributes actively mislead assistive technology users. A `role="button"` on a div tells a screen reader "this is a button" — the user presses Enter expecting an action, and nothing happens because you did not add a keyboard handler. Now the user is confused and stuck.

```svelte
<!-- WRONG: ARIA used where native HTML would work -->
<div role="button" tabindex="0" onclick={save} onkeydown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(); }
}}>
  Save
</div>
<!-- This is 4 lines to replicate what <button> does in 1 line -->

<!-- CORRECT: just use a button -->
<button onclick={save}>Save</button>

<!-- WRONG: aria-hidden on a focusable element (ghost element) -->
<button aria-hidden="true" onclick={doSomething}>Hidden Action</button>

<!-- CORRECT: if it should be hidden, remove it from both trees -->
{#if showButton}
  <button onclick={doSomething}>Action</button>
{/if}
```

### ARIA Roles

Roles define what an element is:

```svelte
<!-- Tab interface — no native HTML equivalent -->
<div role="tablist" aria-label="Product information">
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

Notice the `tabindex` management. In a tablist, only the active tab has `tabindex="0"` (naturally focusable). Inactive tabs have `tabindex="-1"` (focusable programmatically but not via Tab). Users navigate between tabs with arrow keys, not Tab. This is the "roving tabindex" pattern — more on this below.

### ARIA Properties and States

Properties describe characteristics. States describe the current condition:

```svelte
<!-- aria-label: accessible name when no visible text exists -->
<button aria-label="Close dialog" onclick={closeModal}>
  <svg aria-hidden="true"><!-- X icon --></svg>
</button>

<!-- aria-describedby: additional description beyond the label -->
<label for="password">Password</label>
<input
  type="password"
  id="password"
  aria-describedby="password-help"
/>
<p id="password-help">Must be at least 8 characters with one number</p>

<!-- aria-expanded: indicates whether a collapsible section is open -->
<button aria-expanded={isMenuOpen} aria-controls="dropdown-menu">
  Menu
</button>
<ul id="dropdown-menu" hidden={!isMenuOpen}>
  <li><a href="/settings">Settings</a></li>
  <li><a href="/profile">Profile</a></li>
</ul>

<!-- aria-hidden: hides decorative content from the accessibility tree -->
<span aria-hidden="true">★★★★☆</span>
<span class="sr-only">4 out of 5 stars</span>

<!-- aria-live: announces dynamic content changes without focus -->
<div aria-live="polite" aria-atomic="true">
  {#if saveStatus === 'saving'}
    Saving changes...
  {:else if saveStatus === 'saved'}
    Changes saved successfully.
  {:else if saveStatus === 'error'}
    Error saving changes. Please try again.
  {/if}
</div>

<!-- aria-invalid: indicates a field has a validation error -->
<label for="email">Email</label>
<input
  type="email"
  id="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? 'email-error' : undefined}
/>
{#if hasError}
  <p id="email-error" role="alert">Please enter a valid email address</p>
{/if}

<!-- aria-busy: indicates a region is being updated -->
<div aria-busy={isLoading} aria-live="polite">
  {#if isLoading}
    <p>Loading results...</p>
  {:else}
    <!-- results here -->
  {/if}
</div>

<!-- aria-current: indicates the current item in a set -->
<nav>
  <a href="/" aria-current={currentPath === '/' ? 'page' : undefined}>Home</a>
  <a href="/about" aria-current={currentPath === '/about' ? 'page' : undefined}>About</a>
</nav>
```

### The `inert` Attribute: A Modern Alternative to aria-hidden

The `inert` attribute is a newer HTML feature that solves a common problem: making an entire subtree both invisible to assistive technology AND non-interactive for keyboard users. Before `inert`, you had to combine `aria-hidden="true"` with `tabindex="-1"` on every focusable element — tedious and error-prone.

```svelte
<script lang="ts">
  let isModalOpen = $state(false);
</script>

<!-- When the modal is open, the rest of the page is inert -->
<div inert={isModalOpen}>
  <header>...</header>
  <main>
    <!-- All focusable elements in here are automatically
         unfocusable and hidden from assistive technology -->
  </main>
  <footer>...</footer>
</div>

{#if isModalOpen}
  <dialog open>
    <!-- Modal content — the only interactive area -->
  </dialog>
{/if}
```

The `inert` attribute does three things simultaneously: removes all elements from the tab order, hides the subtree from the accessibility tree, and prevents click/touch events. It is the correct modern approach for managing background content when a modal or drawer is open, and it is supported in all modern browsers.

### Live Regions: Announcing Dynamic Content

Live regions tell screen readers to announce content changes without moving focus. This is essential for notifications, status updates, form validation messages, and loading states:

- `aria-live="polite"` — announced after the screen reader finishes the current speech. Use for non-urgent updates (save status, search results count).
- `aria-live="assertive"` — interrupts the current speech immediately. Use sparingly, only for urgent messages (errors, security warnings).
- `role="alert"` — shorthand for `aria-live="assertive"` with `aria-atomic="true"`.
- `role="status"` — shorthand for `aria-live="polite"` with `aria-atomic="true"`.

A critical gotcha with live regions: **the live region element must exist in the DOM before the content changes.** If you conditionally render the live region itself, the screen reader may not detect the change because it was not monitoring that element:

```svelte
<!-- WRONG: live region is conditionally rendered — screen reader may miss it -->
{#if errorMessage}
  <div role="alert">{errorMessage}</div>
{/if}

<!-- CORRECT: live region is always in the DOM, content changes inside it -->
<div role="alert" aria-atomic="true">
  {#if errorMessage}
    {errorMessage}
  {/if}
</div>
```

```svelte
<!-- Toast notification system with live region -->
<div aria-live="polite" class="sr-only" id="toast-announcer">
  {toastMessage}
</div>

<!-- Visual toast (may be decorative duplicate of the live region) -->
{#if showToast}
  <div class="toast" role="status">
    {toastMessage}
  </div>
{/if}
```

### Practical Live Region Patterns

Here are common patterns where live regions are essential:

```svelte
<!-- Search results count -->
<div role="status" aria-live="polite" aria-atomic="true">
  {results.length} results found for "{searchTerm}"
</div>

<!-- Form submission status -->
<div aria-live="polite" aria-atomic="true">
  {#if formState === 'submitting'}
    Submitting your order...
  {:else if formState === 'success'}
    Order placed successfully. Confirmation number: {confirmationId}
  {:else if formState === 'error'}
    Order failed. {errorMessage}
  {/if}
</div>

<!-- Countdown timer -->
<div role="timer" aria-live="assertive" aria-atomic="true">
  {minutes}:{seconds.toString().padStart(2, '0')} remaining
</div>

<!-- Chat messages — announce new ones without interrupting -->
<div aria-live="polite" aria-relevant="additions">
  {#each messages as message (message.id)}
    <p>{message.author}: {message.text}</p>
  {/each}
</div>
```

The `aria-relevant` attribute controls what types of changes trigger announcements: `additions` (new content), `removals` (removed content), `text` (text changes), or `all`. The default is `additions text`.

## Keyboard Navigation and Focus Management

Keyboard accessibility is non-negotiable. Every interactive element must be reachable and operable via keyboard:

- **Tab** moves forward through focusable elements; **Shift+Tab** moves backward
- **Enter** activates links and buttons; **Space** activates buttons and toggles checkboxes
- **Escape** closes modals, dropdowns, and popovers
- **Arrow keys** navigate within composite widgets (tabs, menus, radio groups)

### Focus Visibility

Users must always be able to see where focus is. The default browser focus ring is functional but often styled away by CSS resets. **Never remove focus styles without providing a replacement.**

```css
/* WRONG: removes focus visibility entirely */
*:focus {
  outline: none;
}

/* CORRECT: custom focus styles that are visible */
:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

/* :focus-visible only shows for keyboard users, not mouse clicks */
/* This gives you the best of both worlds */
```

Here is a more comprehensive approach that works with dark mode:

```css
/* Base focus style — works in both light and dark themes */
:focus-visible {
  outline: 2px solid var(--color-focus-ring, #4f46e5);
  outline-offset: 2px;
  border-radius: 2px;
}

/* High contrast mode support */
@media (forced-colors: active) {
  :focus-visible {
    outline: 3px solid Highlight;
  }
}

/* Make sure focus rings are never clipped by overflow:hidden parents */
.card:focus-within {
  overflow: visible;
}
```

### Roving Tabindex

In composite widgets (tablists, menus, toolbars), users expect to Tab into the widget, use arrow keys to navigate between items, and Tab out. This is the "roving tabindex" pattern:

```svelte
<script lang="ts">
  let items = ['Home', 'Products', 'About', 'Contact'];
  let activeIndex = $state(0);
  let itemRefs: HTMLButtonElement[] = [];

  function handleKeyDown(event: KeyboardEvent) {
    let newIndex = activeIndex;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = (activeIndex + 1) % items.length;
        event.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = (activeIndex - 1 + items.length) % items.length;
        event.preventDefault();
        break;
      case 'Home':
        newIndex = 0;
        event.preventDefault();
        break;
      case 'End':
        newIndex = items.length - 1;
        event.preventDefault();
        break;
      default:
        return;
    }

    activeIndex = newIndex;
    itemRefs[newIndex]?.focus();
  }
</script>

<div role="toolbar" aria-label="Actions" onkeydown={handleKeyDown}>
  {#each items as item, i}
    <button
      bind:this={itemRefs[i]}
      tabindex={i === activeIndex ? 0 : -1}
      aria-pressed={i === activeIndex}
    >
      {item}
    </button>
  {/each}
</div>
```

Only the active item has `tabindex="0"`. All other items have `tabindex="-1"`. When the user presses Tab, they enter the widget at the active item. Arrow keys move focus between items. Tab again moves focus out of the widget entirely. This is the expected keyboard interaction pattern for composite widgets per the WAI-ARIA Authoring Practices.

### Type-ahead Search in Lists

For long lists of items (like a dropdown menu or a listbox), users expect to be able to type characters to jump to matching items. This is called type-ahead or typeahead search, and implementing it is a hallmark of thoughtful accessibility work:

```svelte
<script lang="ts">
  let options = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', /* ... */];
  let activeIndex = $state(0);
  let searchBuffer = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;
  let optionRefs: HTMLElement[] = [];

  function handleKeyDown(event: KeyboardEvent) {
    // Handle arrow keys, Home, End as before...
    if (event.key === 'ArrowDown') {
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      optionRefs[activeIndex]?.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      activeIndex = Math.max(activeIndex - 1, 0);
      optionRefs[activeIndex]?.focus();
      event.preventDefault();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Type-ahead: accumulate characters and find a match
      clearTimeout(searchTimeout);
      searchBuffer += event.key.toLowerCase();

      const matchIndex = options.findIndex(
        opt => opt.toLowerCase().startsWith(searchBuffer)
      );
      if (matchIndex !== -1) {
        activeIndex = matchIndex;
        optionRefs[matchIndex]?.focus();
      }

      // Clear the search buffer after 500ms of inactivity
      searchTimeout = setTimeout(() => {
        searchBuffer = '';
      }, 500);
    }
  }
</script>

<ul role="listbox" aria-label="Select state" onkeydown={handleKeyDown}>
  {#each options as option, i (option)}
    <li
      bind:this={optionRefs[i]}
      role="option"
      aria-selected={i === activeIndex}
      tabindex={i === activeIndex ? 0 : -1}
    >
      {option}
    </li>
  {/each}
</ul>
```

### Skip Links

Long navigation menus force keyboard users to Tab through dozens of links before reaching the main content. A "skip to content" link solves this:

```svelte
<!-- First focusable element on the page -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<nav>
  <!-- many navigation links -->
</nav>

<main id="main-content" tabindex="-1">
  <!-- page content -->
</main>

<style>
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: #000;
    color: #fff;
    padding: 8px 16px;
    z-index: 100;
    transition: top 0.2s;
  }

  .skip-link:focus {
    top: 0;
  }
</style>
```

The skip link is visually hidden until focused. When a keyboard user presses Tab on page load, this is the first thing they encounter. Pressing Enter jumps directly to the main content. The `tabindex="-1"` on `<main>` allows it to receive programmatic focus without appearing in the natural Tab order.

For complex applications, you might need multiple skip links:

```svelte
<div class="skip-links">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <a href="#search" class="skip-link">Skip to search</a>
  <a href="#footer-nav" class="skip-link">Skip to footer navigation</a>
</div>
```

## Focus Trapping and the Dialog Element

When a modal opens, focus must move into the modal. While the modal is open, Tab should be **trapped** inside — it should not escape to the page behind. When the modal closes, focus must return to the trigger. Getting this wrong creates a disorienting experience for keyboard and screen reader users.

### The Native `<dialog>` Element

The native `<dialog>` element handles most focus management automatically:

```svelte
<script lang="ts">
  let dialogEl: HTMLDialogElement;
  let triggerEl: HTMLButtonElement;
  let isOpen = $state(false);

  function openModal() {
    isOpen = true;
    dialogEl.showModal(); // Traps focus automatically, adds backdrop
  }

  function closeModal() {
    dialogEl.close();
    isOpen = false;
    triggerEl.focus(); // Return focus to the trigger
  }
</script>

<button bind:this={triggerEl} onclick={openModal}>
  Open Settings
</button>

<dialog
  bind:this={dialogEl}
  onclose={closeModal}
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Settings</h2>
  <p id="dialog-description">Configure your notification preferences below.</p>

  <form method="dialog">
    <label>
      <input type="checkbox" name="email-notifications" />
      Email notifications
    </label>

    <label>
      <input type="checkbox" name="push-notifications" />
      Push notifications
    </label>

    <label>
      Display name
      <input type="text" name="display-name" />
    </label>

    <div class="dialog-actions">
      <button type="button" onclick={closeModal}>Cancel</button>
      <button type="submit">Save</button>
    </div>
  </form>
</dialog>

<style>
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  dialog {
    border: none;
    border-radius: 8px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
  }

  .dialog-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }
</style>
```

`showModal()` does the following automatically:
1. Opens the dialog as a modal (not just visible)
2. Creates a backdrop that blocks interaction with the page behind
3. Traps focus inside the dialog — Tab cannot escape
4. Moves focus to the first focusable element inside the dialog
5. Pressing Escape fires the `close` event

This is a massive amount of accessibility behavior that you get for free from a single HTML element. Before `<dialog>`, implementing a fully accessible modal required hundreds of lines of JavaScript.

### Initial Focus in Dialogs

By default, `showModal()` moves focus to the first focusable element in the dialog. But this is not always the best choice. In a confirmation dialog, you might want focus on the "Cancel" button (the safe choice) rather than the "Delete" button. In a search dialog, you want focus on the search input:

```svelte
<script lang="ts">
  let dialogEl: HTMLDialogElement;
  let searchInputEl: HTMLInputElement;

  function openSearchDialog() {
    dialogEl.showModal();
    // Override default focus behavior — focus the search input
    searchInputEl.focus();
  }
</script>

<dialog bind:this={dialogEl} aria-label="Search">
  <input
    bind:this={searchInputEl}
    type="search"
    placeholder="Search products..."
    aria-label="Search products"
  />
  <!-- results -->
</dialog>
```

You can also use the `autofocus` attribute on the element you want focused first, though Svelte will warn about this for accessibility reasons (autofocus can disorient screen reader users). In a dialog context, it is generally acceptable.

### Custom Focus Trap (When Dialog Is Not Enough)

Sometimes you need focus trapping outside of a dialog — for example, a slide-out navigation panel or a full-screen search overlay:

```svelte
<script lang="ts">
  let panelEl: HTMLDivElement;
  let isOpen = $state(false);
  let triggerEl: HTMLButtonElement;

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !panelEl) return;

    const focusableElements = panelEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift+Tab: if focus is on the first element, wrap to last
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab: if focus is on the last element, wrap to first
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  function openPanel() {
    isOpen = true;
    // Focus the first element after the DOM updates
    requestAnimationFrame(() => {
      const firstFocusable = panelEl?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])'
      );
      firstFocusable?.focus();
    });
  }

  function closePanel() {
    isOpen = false;
    triggerEl.focus(); // Return focus to trigger
  }
</script>

{#if isOpen}
  <!-- Inert background: prevents interaction with content behind the panel -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={closePanel} onkeydown={(e) => e.key === 'Escape' && closePanel()}></div>

  <div
    bind:this={panelEl}
    class="panel"
    role="dialog"
    aria-label="Navigation menu"
    aria-modal="true"
    onkeydown={trapFocus}
  >
    <button onclick={closePanel} aria-label="Close navigation">Close</button>
    <nav>
      <a href="/">Home</a>
      <a href="/products">Products</a>
      <a href="/about">About</a>
    </nav>
  </div>
{/if}
```

### Focus Restoration Patterns

A subtle but important detail: when any overlay, drawer, or popover closes, focus must return to a logical place. Usually this is the element that triggered the open action:

```svelte
<script lang="ts">
  let triggerRef: HTMLButtonElement;
  let isOpen = $state(false);

  function open() {
    isOpen = true;
  }

  function close() {
    isOpen = false;
    // Restore focus — critical for keyboard users
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      triggerRef?.focus();
    });
  }
</script>

<button bind:this={triggerRef} onclick={open}>
  Open Menu
</button>

{#if isOpen}
  <div role="menu" aria-label="Actions">
    <button role="menuitem" onclick={() => { doAction(); close(); }}>
      Action 1
    </button>
    <button role="menuitem" onclick={() => { doOther(); close(); }}>
      Action 2
    </button>
  </div>
{/if}
```

But what if the trigger element is removed from the DOM? (For example, deleting an item from a list removes the delete button.) In that case, move focus to the next logical element — the next item in the list, the previous item, or the list's heading:

```svelte
<script lang="ts">
  let items = $state([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
  let itemRefs: Map<number, HTMLElement> = new Map();
  let listHeadingRef: HTMLElement;

  function deleteItem(id: number, index: number) {
    items = items.filter(i => i.id !== id);

    requestAnimationFrame(() => {
      // Try to focus the next item, then the previous, then the heading
      const nextItem = items[index];
      const prevItem = items[index - 1];

      if (nextItem && itemRefs.has(nextItem.id)) {
        itemRefs.get(nextItem.id)?.focus();
      } else if (prevItem && itemRefs.has(prevItem.id)) {
        itemRefs.get(prevItem.id)?.focus();
      } else {
        listHeadingRef?.focus();
      }
    });
  }
</script>

<h2 bind:this={listHeadingRef} tabindex="-1">Items</h2>
<ul>
  {#each items as item, index (item.id)}
    <li bind:this={itemRefs.set(item.id, this) && undefined}>
      {item.name}
      <button onclick={() => deleteItem(item.id, index)}>Delete</button>
    </li>
  {/each}
</ul>
```

## Color Contrast: Beyond the Basics

Insufficient color contrast is the single most common accessibility failure found in automated audits. WebAIM's annual survey consistently finds that over 80% of home pages have contrast failures.

### WCAG Contrast Requirements

WCAG defines minimum contrast ratios between text and its background:

- **AA (standard)**: 4.5:1 for normal text, 3:1 for large text (18px bold or 24px regular)
- **AAA (enhanced)**: 7:1 for normal text, 4.5:1 for large text
- **Non-text elements**: 3:1 for UI components and graphical objects (borders, icons, focus indicators)

### APCA: The Modern Alternative

The traditional WCAG contrast algorithm has known issues — it can reject perfectly readable combinations while approving hard-to-read ones, especially with dark mode colors. The **Advanced Perceptual Contrast Algorithm (APCA)** is being developed as the next-generation contrast standard for WCAG 3.0.

APCA accounts for:
- **Polarity sensitivity**: Light text on dark backgrounds is perceived differently than dark text on light backgrounds. A combination that passes in light mode might fail in dark mode at the same ratio.
- **Font size and weight**: Larger, bolder text needs less contrast than small, thin text. APCA provides a continuous scale rather than the arbitrary "normal" vs "large" cutoff.
- **Spatial frequency**: How the human visual system processes different sizes of text.

While APCA is not yet an official WCAG recommendation, tools like the APCA Contrast Calculator are available. For now, target WCAG 2.2 AA ratios but be aware that APCA represents the direction the standard is moving.

### Never Rely on Color Alone

Color vision deficiency affects approximately 300 million people worldwide. If an error state is only indicated by red text, a user with red-green color blindness misses it entirely.

```svelte
<!-- WRONG: color alone indicates state -->
<input class="border-red-500" />
<p class="text-red-600">Invalid email</p>

<!-- WRONG: color alone distinguishes chart series -->
<div class="chart-line" style="color: red">Revenue</div>
<div class="chart-line" style="color: green">Expenses</div>

<!-- CORRECT: color + icon + text + aria attributes -->
<input
  class="border-red-500"
  aria-invalid="true"
  aria-describedby="email-error"
/>
<p id="email-error" class="text-red-600">
  <svg aria-hidden="true" class="error-icon"><!-- warning icon --></svg>
  Please enter a valid email address
</p>

<!-- CORRECT: color + pattern + label for charts -->
<div class="chart-line" style="color: red; border-style: solid">Revenue (solid red line)</div>
<div class="chart-line" style="color: green; border-style: dashed">Expenses (dashed green line)</div>
```

### Contrast in Dark Mode

Dark mode introduces unique contrast challenges. Many developers assume they can simply invert their light mode colors, but perception is asymmetric — white text on a dark background and dark text on a white background at the same mathematical contrast ratio do NOT appear equally readable:

```svelte
<!-- WRONG: same gray used in both modes — passes in light, fails in dark -->
<p class="text-gray-500 dark:text-gray-500">Subtle text</p>
<!-- Light mode: #6b7280 on #ffffff = 4.6:1 (passes AA) -->
<!-- Dark mode: #6b7280 on #111827 = 3.8:1 (fails AA) -->

<!-- CORRECT: different shades per mode to maintain adequate contrast -->
<p class="text-gray-600 dark:text-gray-400">Subtle text</p>
<!-- Light mode: #4b5563 on #ffffff = 7.0:1 (passes AA) -->
<!-- Dark mode: #9ca3af on #111827 = 5.5:1 (passes AA) -->
```

### Tools for Checking Contrast

- **Chrome DevTools**: Inspect an element, look at the color property — DevTools shows the contrast ratio and whether it passes AA/AAA
- **Firefox DevTools**: The Accessibility panel highlights contrast issues across the page
- **WebAIM Contrast Checker**: Enter foreground and background colors to check the ratio
- **axe DevTools browser extension**: Automated scan that flags all contrast failures
- **Stark** (Figma plugin): Check contrast during design, before writing code

## Svelte's Built-in a11y Warnings

Svelte's compiler includes accessibility checks that catch common mistakes at **build time**. This is a unique advantage — most frameworks only offer accessibility checks through separate linting tools or runtime audits. Svelte catches issues before your code ever reaches a browser.

### The Complete List of Svelte a11y Warnings

Svelte checks for these issues (among others):

1. **a11y-alt-text**: `<img>` without `alt`, `<area>` without `alt`, `<input type="image">` without `alt`, and `<object>` without `title` or `aria-label`
2. **a11y-aria-attributes**: Invalid `aria-*` attributes (typos, non-existent attributes)
3. **a11y-aria-role**: Invalid or abstract ARIA roles
4. **a11y-autofocus**: Use of `autofocus` attribute (can disorient screen reader users)
5. **a11y-click-events-have-key-events**: `onclick` on non-interactive elements without `onkeydown`/`onkeyup`
6. **a11y-distracting-elements**: Use of `<marquee>` or `<blink>` (harmful for users with vestibular disorders)
7. **a11y-hidden**: `aria-hidden="true"` on elements that contain focusable children
8. **a11y-img-redundant-alt**: Alt text containing "image", "picture", or "photo" (redundant — screen readers already announce "image")
9. **a11y-interactive-supports-focus**: Interactive elements with event handlers missing `tabindex`
10. **a11y-invalid-attribute**: Empty or invalid `href`, `src`, etc.
11. **a11y-label-has-associated-control**: `<label>` without a matching `for`/`id` or nested control
12. **a11y-media-has-caption**: `<video>` without `<track kind="captions">`
13. **a11y-missing-attribute**: Missing required attributes for ARIA roles
14. **a11y-missing-content**: Headings and anchors without text content
15. **a11y-mouse-events-have-key-events**: `onmouseenter`/`onmouseleave` without `onfocus`/`onblur`
16. **a11y-no-noninteractive-element-interactions**: Event handlers on non-interactive elements
17. **a11y-no-noninteractive-tabindex**: `tabindex` on non-interactive elements without a role
18. **a11y-no-redundant-roles**: `role="button"` on a `<button>` (the role is implicit)
19. **a11y-positive-tabindex**: `tabindex` values greater than 0 (disrupts natural focus order)
20. **a11y-role-has-required-aria-props**: ARIA roles missing required properties (e.g., `role="checkbox"` without `aria-checked`)
21. **a11y-structure**: Heading elements outside of content or improper heading structure
22. **a11y-no-static-element-interactions**: Event handlers on elements like `<div>` that have no semantic meaning

These warnings are not exhaustive — they catch the low-hanging fruit. But they are a powerful first line of defense that most other frameworks do not offer. **Do not ignore them.** If you find yourself suppressing warnings with `<!-- svelte-ignore a11y-... -->`, stop and consider whether there is a better approach. The compiler is usually right.

```svelte
<!-- Svelte warns: "A11y: <img> element should have an alt attribute" -->
<img src="/hero.jpg" />

<!-- Fix: add meaningful alt text -->
<img src="/hero.jpg" alt="Mountain landscape at sunset with orange and purple clouds" />

<!-- Svelte warns: "A11y: visible, non-interactive elements with an onclick event
     must be accompanied by a keyboard event handler" -->
<div onclick={handleClick}>Click me</div>

<!-- Fix: use a button instead -->
<button onclick={handleClick}>Click me</button>
```

### When Svelte Ignore Is Legitimate

There are rare cases where suppressing a Svelte a11y warning is the right call. Document why whenever you do:

```svelte
<!-- This overlay needs onclick to close when clicked outside the panel.
     Keyboard users close via Escape, which is handled on the panel.
     The overlay is not an interactive element in the accessibility tree. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={close}></div>
```

If you cannot write a clear justification, the warning is probably right and you should fix the code instead.

## Alt Text: The Art of Description

Every `<img>` needs an `alt` attribute. But writing good alt text is a skill, not just a checkbox:

```svelte
<!-- INFORMATIVE IMAGE: describe what it shows AND why it matters -->
<img
  src="/chart.png"
  alt="Bar chart showing sales increased 40% from January ($1.2M) to March ($1.68M)"
/>
<!-- Bad: "chart" or "sales chart" — too vague to be useful -->

<!-- DECORATIVE IMAGE: empty alt (not missing alt!) -->
<img src="/divider.png" alt="" />
<!-- An empty alt="" tells screen readers to skip it entirely.
     A missing alt attribute causes screen readers to read the filename. -->

<!-- FUNCTIONAL IMAGE (inside a link): describe the destination, not the image -->
<a href="/home">
  <img src="/logo.png" alt="Acme Store home page" />
</a>
<!-- Bad: "company logo" — the user wants to know where the link goes -->

<!-- ICON BUTTON: label the action, not the icon -->
<button aria-label="Delete item">
  <svg aria-hidden="true"><!-- trash can icon --></svg>
</button>
<!-- The icon is decorative (aria-hidden). The button has a label. -->

<!-- COMPLEX IMAGE: long description via figcaption -->
<figure>
  <img
    src="/architecture.png"
    alt="System architecture diagram showing client-server interaction"
    aria-describedby="arch-desc"
  />
  <figcaption id="arch-desc">
    The client sends requests to an API gateway, which authenticates them
    and routes to one of three microservices. Each service has its own
    PostgreSQL database. Services communicate asynchronously via a
    message queue.
  </figcaption>
</figure>

<!-- IMAGE IN A FIGURE WITH VISIBLE CAPTION -->
<figure>
  <img src="/team.jpg" alt="Our engineering team of 12 people standing in front of the office building" />
  <figcaption>The engineering team at our Portland headquarters, June 2025</figcaption>
</figure>
```

Write alt text that conveys the **purpose** of the image, not just what it looks like. "Photo of a dog" is less useful than "Golden retriever playing fetch in the park." But context matters — if the image is on a dog breed identification page, "Golden retriever" is the right alt text. The purpose determines the description.

### Alt Text Decision Tree

Use this flowchart to decide what kind of alt text to write:

1. **Is the image purely decorative?** (borders, spacers, background textures) → `alt=""`
2. **Is the image inside an interactive element?** (link, button) → Describe the action or destination, not the image
3. **Does the image contain text?** (screenshot, sign, badge) → Include all the text in the alt
4. **Is the image a chart or graph?** → Summarize the key data point or trend; put full data in a table
5. **Is the image a photograph used for content?** → Describe what is happening and why it matters in context

## Screen Reader Testing: A Practical Walkthrough

Automated tools catch roughly 30-50% of accessibility issues. The rest require manual testing with actual assistive technologies. Here is how to get started:

### VoiceOver (macOS — built in)

1. **Enable**: Press Cmd+F5 (or go to System Settings > Accessibility > VoiceOver)
2. **Navigate**: Use Ctrl+Option+Right/Left arrow to move through elements
3. **Interact**: Press Ctrl+Option+Space to activate buttons and links
4. **Rotor**: Press Ctrl+Option+U to open the rotor — a menu of all headings, links, landmarks, and form controls on the page. This is how blind users scan a page.
5. **Stop speaking**: Press Ctrl to silence VoiceOver mid-announcement

### NVDA (Windows — free)

1. **Install**: Download from nvaccess.org (free, open source)
2. **Navigate**: Use Insert+Down arrow for continuous reading, Tab for focusable elements
3. **Headings**: Press H to jump to the next heading, Shift+H for the previous
4. **Landmarks**: Press D to jump to the next landmark
5. **Elements list**: Press Insert+F7 to see all links, headings, landmarks, and form fields

### What to Listen For

When testing with a screen reader, ask yourself:

1. **Can I understand the page structure?** Are headings announced in logical order? Can I navigate by landmarks?
2. **Do all interactive elements have names?** When I Tab to a button, does the screen reader announce what it does?
3. **Are form fields labeled?** When I Tab to an input, does it announce what to enter?
4. **Are dynamic changes announced?** When a form shows an error, does the screen reader say something?
5. **Can I complete the task?** Can I fill out the form, submit it, and understand the result — all without seeing the screen?

### Common Screen Reader Gotchas

These are issues that only surface during screen reader testing — automated tools miss them all:

- **Unlabeled icon buttons**: Screen readers announce "button" with no name, or worse, announce the SVG filename
- **Reading order mismatch**: CSS grid or flexbox reordering creates a visual layout that does not match the DOM order. Screen readers follow DOM order, so users hear content in a confusing sequence.
- **Overly verbose descriptions**: An `aria-label` of "Click this button to add the currently selected item to your shopping cart for later purchase" is exhausting to hear repeatedly. Keep labels concise: "Add to cart."
- **Dynamic content not announced**: A toast notification appears visually but is not in a live region, so screen reader users never know about it
- **Modal escape routes**: The dialog traps Tab correctly, but pressing Escape does not close it, or the dialog opens without moving focus into it

## Complete Accessible Component: Notification Toast System

Here is a production-quality toast notification system that demonstrates multiple accessibility patterns working together:

```svelte
<!-- ToastContainer.svelte -->
<script lang="ts">
  import { fly } from 'svelte/transition';

  type Toast = {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    duration: number;
  };

  let toasts = $state<Toast[]>([]);

  export function addToast(message: string, type: Toast['type'] = 'info', duration = 5000) {
    const id = crypto.randomUUID();
    toasts.push({ id, message, type, duration });

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }

  function removeToast(id: string) {
    toasts = toasts.filter(t => t.id !== id);
  }

  const icons: Record<Toast['type'], string> = {
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info'
  };

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
</script>

<!-- Live region for screen reader announcements -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  {#each toasts as toast (toast.id)}
    {toast.type}: {toast.message}
  {/each}
</div>

<!-- Visual toasts -->
<div class="toast-container" aria-hidden="true">
  {#each toasts as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      transition:fly={prefersReducedMotion()
        ? { duration: 0 }
        : { y: -20, duration: 300 }}
    >
      <span class="toast-icon">{icons[toast.type]}</span>
      <span class="toast-message">{toast.message}</span>
      <button
        class="toast-close"
        onclick={() => removeToast(toast.id)}
        tabindex={-1}
      >
        Dismiss
      </button>
    </div>
  {/each}
</div>

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

  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 400px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .toast-success { background: #f0fdf4; border-left: 4px solid #22c55e; }
  .toast-error { background: #fef2f2; border-left: 4px solid #ef4444; }
  .toast-warning { background: #fffbeb; border-left: 4px solid #f59e0b; }
  .toast-info { background: #eff6ff; border-left: 4px solid #3b82f6; }
</style>
```

Key accessibility patterns in this component:

1. **Separate live region and visual display**: The screen reader live region (`role="status"`) is visually hidden but announced. The visual toasts are `aria-hidden="true"` to prevent double-announcement.
2. **Reduced motion respect**: Transitions check `prefers-reduced-motion` and skip animation for users who requested it.
3. **Semantic toast types**: Each toast type (success, error, warning, info) is announced with its type so screen reader users understand the severity.
4. **Non-intrusive announcements**: `aria-live="polite"` waits for the screen reader to finish before announcing, avoiding interruption of the user's workflow.

## Accessible Forms: A Comprehensive Pattern

Forms are where accessibility most directly impacts business outcomes. An inaccessible checkout form loses sales. An inaccessible signup form loses users. Here is a complete accessible form pattern:

```svelte
<script lang="ts">
  let name = $state('');
  let email = $state('');
  let errors = $state<Record<string, string>>({});
  let submitted = $state(false);
  let statusMessage = $state('');

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    }

    errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    if (!validate()) {
      // Focus the first field with an error
      const firstErrorField = document.querySelector<HTMLElement>(
        '[aria-invalid="true"]'
      );
      firstErrorField?.focus();
      statusMessage = `${Object.keys(errors).length} errors found. Please correct and try again.`;
      return;
    }

    statusMessage = 'Form submitted successfully.';
    submitted = true;
  }
</script>

<!-- Live region for form status announcements -->
<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
  {statusMessage}
</div>

<form onsubmit={handleSubmit} novalidate>
  <div>
    <label for="name">
      Name
      <span aria-hidden="true" class="text-red-500">*</span>
    </label>
    <input
      id="name"
      type="text"
      bind:value={name}
      required
      aria-required="true"
      aria-invalid={errors.name ? true : undefined}
      aria-describedby={errors.name ? 'name-error' : undefined}
    />
    {#if errors.name}
      <p id="name-error" class="error-message" role="alert">
        {errors.name}
      </p>
    {/if}
  </div>

  <div>
    <label for="email">
      Email
      <span aria-hidden="true" class="text-red-500">*</span>
    </label>
    <input
      id="email"
      type="email"
      bind:value={email}
      required
      aria-required="true"
      aria-invalid={errors.email ? true : undefined}
      aria-describedby={errors.email ? 'email-error' : 'email-hint'}
    />
    <p id="email-hint" class="hint-text">We will never share your email</p>
    {#if errors.email}
      <p id="email-error" class="error-message" role="alert">
        {errors.email}
      </p>
    {/if}
  </div>

  <button type="submit">Register</button>
</form>
```

Key patterns in this form:

- **Required fields**: Use both `required` (native validation) and `aria-required="true"` (screen reader announcement). The visual asterisk is `aria-hidden` because the ARIA attribute already communicates required status.
- **Error association**: `aria-describedby` links each input to its error message. When the input has focus, the screen reader reads both the label and the error.
- **Error focus**: On validation failure, focus moves to the first invalid field so the user knows where to start fixing.
- **Error summary**: The live region announces how many errors were found, giving users context before they navigate to each one.
- **Hint text**: `aria-describedby` can point to hint text when there are no errors, and switches to the error message when one appears.

## Testing Accessibility: A Comprehensive Strategy

Building accessible software requires testing with the same rigor you apply to functionality:

### 1. Automated Testing with axe-core

Automated tests catch low-hanging fruit: missing alt text, contrast failures, missing form labels, invalid ARIA attributes. Run them in your CI pipeline:

```typescript
// In a Playwright test
import AxeBuilder from '@axe-core/playwright';

test('home page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Test specific sections
test('navigation is accessible', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .include('nav')
    .analyze();
  expect(results.violations).toEqual([]);
});

// Test after user interactions — dynamic content matters
test('modal is accessible when open', async ({ page }) => {
  await page.goto('/');
  await page.click('button[aria-label="Open settings"]');
  const results = await new AxeBuilder({ page })
    .include('dialog')
    .analyze();
  expect(results.violations).toEqual([]);
});

// Exclude known issues (temporarily)
test('main content is accessible', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .exclude('#third-party-widget')
    .analyze();
  expect(results.violations).toEqual([]);
});
```

### 2. Keyboard Testing

Unplug your mouse (or just do not touch it) and try to complete every user flow:

- Can you reach every interactive control with Tab?
- Can you see where focus is at all times?
- Can you activate buttons with Enter/Space and links with Enter?
- Can you close modals with Escape?
- Does focus return to a logical place after closing a modal or completing an action?
- Can you navigate form fields and understand what each one expects?
- Can you use the entire checkout flow, fill in all forms, and submit?
- Are there any "keyboard traps" — places where you can Tab in but cannot Tab out?

### 3. Screen Reader Testing

Test with at least one screen reader. VoiceOver (Mac) or NVDA (Windows) are the most common:

- Navigate the page by headings — does the structure make sense?
- Tab through all interactive elements — are they all labeled?
- Complete a core user flow (sign up, search, checkout) — can you do it?
- Trigger a dynamic update (add to cart, submit form) — is the change announced?

### 4. Lighthouse Audit

Chrome DevTools > Lighthouse > Accessibility gives you a score and actionable suggestions. Aim for 100, but remember that Lighthouse only catches automated issues — a perfect score does not mean your app is accessible.

### 5. Continuous Integration

Add accessibility checks to your CI pipeline so violations cannot be merged:

```typescript
// playwright.config.ts — run a11y checks as part of your test suite
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    {
      name: 'accessibility',
      testMatch: /.*\.a11y\.ts/,
    }
  ]
});
```

### 6. The Accessibility Testing Pyramid

Think of accessibility testing as a pyramid, similar to the test pyramid:

```
         /\
        /  \
       / UT \      User testing with people who use assistive technology
      /------\
     / Manual \    Keyboard testing + screen reader testing
    /----------\
   / Automated  \  axe-core, Lighthouse, Svelte compiler warnings
  /--------------\
```

The base (automated) catches the most issues at the lowest cost. The middle (manual) catches interaction issues that automation misses. The top (user testing) catches usability issues that even manual testing misses. You need all three layers.

Automated tools catch roughly 30-50% of accessibility issues. The rest require manual testing. A passing Lighthouse score does not mean your app is accessible — it means you have avoided the most obvious mistakes. Real accessibility testing includes keyboard navigation, screen reader testing, and ideally, user testing with people who rely on assistive technologies.

## Try It

1. **Audit**: Take one of your existing Svelte pages. Replace any `<div>` elements that should be semantic elements (`<nav>`, `<main>`, `<button>`, `<header>`). Add missing `alt` attributes to images. Ensure headings follow a logical order (h1, h2, h3 — no skipping). Add `aria-label` to any icon-only buttons. Run the axe browser extension and fix every issue it reports.

2. **Build**: Create a fully accessible modal using the native `<dialog>` element. Verify that: (a) focus moves into the modal when it opens, (b) Tab cycles only through elements inside the modal, (c) Escape closes it, (d) focus returns to the trigger button when it closes, (e) the modal has `aria-labelledby` pointing to its heading, (f) the backdrop prevents interaction with the page behind. Use the `inert` attribute on the page content behind the dialog.

3. **Keyboard test**: Navigate your entire application using only the keyboard. Document every place you get stuck (cannot reach, cannot activate, cannot see focus, cannot escape). Fix each issue.

4. **Screen reader test**: Turn on VoiceOver (Mac: Cmd+F5) or install NVDA (Windows). Navigate your app using only the screen reader's navigation commands. Can you understand the page structure? Can you complete the primary user flow? Write down three things you discovered that surprised you.

5. **Advanced**: Build an accessible autocomplete/combobox component with the following behavior: (a) typing filters a dropdown list, (b) arrow keys navigate options, (c) Enter selects the focused option, (d) Escape closes the dropdown, (e) the input has `role="combobox"`, `aria-expanded`, `aria-controls`, and `aria-activedescendant` attributes, (f) options have `role="option"` with `aria-selected`, (g) results count is announced via a live region. Implement type-ahead search so that typing "ca" highlights "California" in the list.

6. **Form challenge**: Build an accessible multi-step form (wizard) with: progress indication announced to screen readers, error summary on each step, focus management when moving between steps, and a review step that lets users go back and edit previous answers. Each step should validate before allowing progression.

## Key Takeaways

- Accessibility is a legal requirement in many jurisdictions and a moral imperative — it is not optional
- The accessibility tree is a parallel representation of your page that assistive technologies consume — inspect it as routinely as you inspect the DOM
- Different users experience the web in fundamentally different ways: screen readers, keyboard-only, voice control, switch devices, magnification, high contrast, reduced motion
- Semantic HTML is the foundation — the right element gives you accessibility for free. A `<button>` is focusable, keyboard-operable, and announced correctly. A `<div>` gives you nothing.
- The five rules of ARIA: (1) prefer native HTML, (2) do not override native semantics, (3) interactive controls must be keyboard-operable, (4) do not hide focusable elements, (5) all interactive elements need accessible names
- Bad ARIA is worse than no ARIA — incorrect attributes actively mislead assistive technology users
- Focus management is critical for dynamic UIs — modals need focus trapping and focus restoration. Use the native `<dialog>` element whenever possible. Use `inert` for background content.
- Roving tabindex is the correct pattern for composite widgets (tabs, toolbars, menus) — only the active item has `tabindex="0"`, arrow keys move between items
- Live regions (`aria-live`) must exist in the DOM before content changes — conditionally rendering the live region element itself can cause announcements to be missed
- Color contrast must meet WCAG AA (4.5:1 for text, 3:1 for large text and UI components) — and never rely on color alone to convey information
- Dark mode contrast is not symmetric — verify contrast ratios separately for each color scheme
- APCA is the next-generation contrast algorithm that accounts for polarity, font weight, and spatial frequency — be aware of it even though WCAG 2.2 AA ratios are still the standard
- WCAG 2.2 adds new criteria for focus visibility, dragging alternatives, minimum target sizes, and accessible authentication
- Svelte's compiler catches 20+ categories of a11y mistakes at build time — pay attention to those warnings and do not suppress them without a documented justification
- Skip links let keyboard users bypass navigation to reach main content directly
- Accessible forms need: labels on every input, `aria-required` for required fields, `aria-invalid` for errors, `aria-describedby` for help text and error messages, focus management on validation failure, and error summaries in live regions
- Automated tools catch 30-50% of issues; keyboard testing, screen reader testing, and user testing catch the rest — you need all three layers
- Write alt text that conveys the purpose of the image, not just its appearance — and use empty `alt=""` for decorative images
- Respect `prefers-reduced-motion` — disable animations for users who experience vestibular disorders
- Test with real assistive technologies: VoiceOver, NVDA, keyboard-only navigation. A Lighthouse score is not sufficient.
- Focus restoration after interactions (closing modals, deleting items, completing actions) is critical — always return focus to a logical element
