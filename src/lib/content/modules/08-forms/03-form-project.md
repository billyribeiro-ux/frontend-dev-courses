# Contact Form Project

It is time to put everything together. In this project, you will build a complete **contact form** with real-time validation and a live preview. This combines nearly every concept you have learned: HTML form elements, CSS styling, `$state()`, `$derived()`, `bind:value`, `{#if}` blocks, and component structure.

This is the kind of form you will build over and over in real-world projects — signing up users, collecting feedback, processing orders. Nail this pattern and you are ready for anything.

But we are not just building a form that works. We are building one the *right* way — with validation patterns that scale, error UX that respects the user, and code structure that a team can maintain. Along the way, you will learn the mental models that separate a junior form implementation from a production-grade one.

## The Goal

We are building a contact form with:
1. Name, email, and message fields
2. A subject dropdown
3. Validation that shows errors as the user types (but only after they interact with a field)
4. A live preview panel that shows what will be submitted
5. A submit button that is disabled until the form is valid
6. A success state after submission with a reset option
7. Responsive layout that works on mobile

## The Mental Model: Form State Machines

Before writing code, understand that every form field is a tiny state machine with three states:

```
PRISTINE ──(user types)──▶ DIRTY + VALID
                            │
                            └──▶ DIRTY + INVALID
```

- **Pristine**: the user has not interacted with this field yet. Do not show errors — it is rude to show "Name is required" before the user has even tried.
- **Dirty + Valid**: the user has entered something, and it passes validation. Show positive feedback (green border, checkmark).
- **Dirty + Invalid**: the user has entered something, but it fails validation. Now show the error — the user has demonstrated intent, and the feedback is helpful, not annoying.

This "touched" or "dirty" tracking is what separates a professional form from one that screams errors the moment the page loads. Libraries like Formik, React Hook Form, and Zod all have this concept built in. In Svelte, we build it ourselves because it is simple and instructive.

## Step 1: Form State

Start by defining all the state your form needs. Notice that we track both the value and whether the field has been touched:

```svelte
<script>
  // Form field values
  let name = $state("");
  let email = $state("");
  let subject = $state("");
  let message = $state("");
  let submitted = $state(false);

  // "Touched" tracking — has the user interacted with this field?
  let nameTouched = $state(false);
  let emailTouched = $state(false);
  let messageTouched = $state(false);
</script>
```

Why separate `touched` state instead of just checking `name.length > 0`? Because a user might type a character, then delete it. The field is now empty, but the user *has* interacted with it. Showing "Name is required" at this point is appropriate — they tried and removed their input.

## Step 2: Validation with $derived()

Use derived state to compute validation status in real time. This is the core insight: **validation rules are derived from field values, not computed imperatively.** You declare what "valid" means, and Svelte keeps everything in sync automatically.

```svelte
<script>
  let name = $state("");
  let email = $state("");
  let subject = $state("");
  let message = $state("");
  let submitted = $state(false);

  let nameTouched = $state(false);
  let emailTouched = $state(false);
  let messageTouched = $state(false);

  // Validation rules — each is a pure function of the field value
  let nameValid = $derived(name.trim().length >= 2);
  // Simple email check for learning purposes — production apps use a library
  let emailValid = $derived(email.includes("@") && email.includes("."));
  let subjectValid = $derived(subject !== "");
  let messageValid = $derived(message.trim().length >= 10);

  // Overall form validity — ALL fields must pass
  let formValid = $derived(nameValid && emailValid && subjectValid && messageValid);

  // Character count — updates live as the user types
  let messageLength = $derived(message.trim().length);

  // Error messages — only shown when the field is touched AND invalid
  let nameError = $derived(
    nameTouched && !nameValid ? "Name must be at least 2 characters." : ""
  );
  let emailError = $derived(
    emailTouched && !emailValid ? "Please enter a valid email address." : ""
  );
  let messageError = $derived(
    messageTouched && !messageValid ? "Message must be at least 10 characters." : ""
  );

  function handleSubmit(event) {
    event.preventDefault();
    if (formValid) {
      submitted = true;
    }
  }

  function resetForm() {
    name = "";
    email = "";
    subject = "";
    message = "";
    submitted = false;
    nameTouched = false;
    emailTouched = false;
    messageTouched = false;
  }
</script>
```

### WRONG vs CORRECT: Validation Approaches

```svelte
<script>
  // WRONG: Imperative validation — checking in the submit handler only
  // The user gets no feedback until they try to submit
  function handleSubmit() {
    let errors = [];
    if (name.length < 2) errors.push("Name too short");
    if (!email.includes("@")) errors.push("Invalid email");
    if (errors.length > 0) {
      alert(errors.join("\n")); // Terrible UX
      return;
    }
    submitted = true;
  }

  // WRONG: Using $effect to set validation state
  // Effects are for side effects (DOM, network), not derived data
  let nameValid = $state(false);
  $effect(() => {
    nameValid = name.trim().length >= 2; // This works but is wrong pattern
  });

  // CORRECT: Declarative validation with $derived
  // Validation is derived data — it is a pure function of the field value
  // Svelte computes it automatically whenever the field changes
  let nameValid = $derived(name.trim().length >= 2);
</script>
```

The `$derived` approach is correct because validation IS derived state — it is a direct computation from the field value. There is no side effect, no timing issue, no stale state. When `name` changes, `nameValid` updates synchronously in the same microtask.

### Why Not $effect for Validation?

This is a common mistake that deserves a deeper explanation:

```svelte
<script>
  let name = $state("");

  // WRONG: $effect creates a timing gap between the value changing
  // and the validation updating. During that gap, you could read
  // stale validation state.
  let nameValid = $state(false);
  $effect(() => {
    nameValid = name.trim().length >= 2;
  });
  // Between name changing and the effect running, nameValid is STALE.
  // If another $derived reads nameValid, it might get the wrong value.

  // CORRECT: $derived is synchronous — no gap, no stale state
  let nameValid = $derived(name.trim().length >= 2);
  // nameValid is ALWAYS consistent with name. No gap. No stale state.
</script>
```

The rule of thumb: if the computation is a pure function of other state (no side effects), use `$derived`. If it needs to interact with the outside world (DOM manipulation, network calls, timers), use `$effect`.

## Step 3: The Form Markup

Build the form with bound inputs and validation messages. Pay attention to the accessibility details — every input has a label, errors are associated with their fields, and the form structure is semantic:

```svelte
{#if submitted}
  <div class="success">
    <h2>Message Sent!</h2>
    <p>Thank you, {name}. We will respond to {email} soon.</p>
    <button onclick={resetForm}>Send Another</button>
  </div>
{:else}
  <div class="form-container">
    <form onsubmit={handleSubmit}>
      <h2>Contact Us</h2>

      <!-- Name field -->
      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          onblur={() => nameTouched = true}
          placeholder="Your full name"
          class:invalid={nameTouched && !nameValid}
          class:valid={nameTouched && nameValid}
          aria-describedby={nameError ? "name-error" : undefined}
          aria-invalid={nameTouched && !nameValid}
        />
        {#if nameError}
          <span id="name-error" class="error" role="alert">{nameError}</span>
        {/if}
      </div>

      <!-- Email field -->
      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          onblur={() => emailTouched = true}
          placeholder="you@example.com"
          class:invalid={emailTouched && !emailValid}
          class:valid={emailTouched && emailValid}
          aria-describedby={emailError ? "email-error" : undefined}
          aria-invalid={emailTouched && !emailValid}
        />
        {#if emailError}
          <span id="email-error" class="error" role="alert">{emailError}</span>
        {/if}
      </div>

      <!-- Subject dropdown -->
      <div class="field">
        <label for="subject">Subject</label>
        <select id="subject" bind:value={subject}>
          <option value="" disabled>Select a subject</option>
          <option value="general">General Inquiry</option>
          <option value="support">Technical Support</option>
          <option value="billing">Billing Question</option>
          <option value="feedback">Feedback</option>
        </select>
      </div>

      <!-- Message textarea -->
      <div class="field">
        <label for="message">
          Message ({messageLength}/10 min characters)
        </label>
        <textarea
          id="message"
          bind:value={message}
          onblur={() => messageTouched = true}
          placeholder="Tell us what's on your mind..."
          rows="5"
          class:invalid={messageTouched && !messageValid}
          class:valid={messageTouched && messageValid}
          aria-describedby={messageError ? "message-error" : undefined}
          aria-invalid={messageTouched && !messageValid}
        ></textarea>
        {#if messageError}
          <span id="message-error" class="error" role="alert">{messageError}</span>
        {/if}
      </div>

      <button type="submit" class="submit-btn" disabled={!formValid}>
        Send Message
      </button>
    </form>

    <!-- Live preview panel -->
    <div class="preview">
      <h3>Live Preview</h3>
      <div class="preview-card">
        <p><strong>From:</strong> {name || "—"}</p>
        <p><strong>Email:</strong> {email || "—"}</p>
        <p><strong>Subject:</strong> {subject || "—"}</p>
        <p><strong>Message:</strong></p>
        <p class="preview-message">{message || "(no message yet)"}</p>
      </div>
    </div>
  </div>
{/if}
```

### Accessibility Details Worth Noting

Several accessibility patterns in this form deserve explanation:

```svelte
<!-- 1. aria-describedby links the input to its error message -->
<input
  aria-describedby={nameError ? "name-error" : undefined}
  aria-invalid={nameTouched && !nameValid}
/>
{#if nameError}
  <span id="name-error" role="alert">{nameError}</span>
{/if}
<!-- When the error appears, screen readers announce it because of role="alert".
     The aria-describedby association means the error is read when the input is focused. -->

<!-- 2. onblur for touched tracking — validation triggers when user LEAVES the field -->
<input onblur={() => nameTouched = true} />
<!-- Why onblur instead of oninput? Because oninput would show errors while the user
     is still typing their name. "N" → "Name must be 2+ characters" → annoying.
     onblur waits until they move to the next field, which feels more natural. -->

<!-- 3. The disabled submit button -->
<button disabled={!formValid}>Send Message</button>
<!-- This prevents submission of invalid data without relying on JavaScript.
     But it also communicates visually: "you are not done yet." The grayed-out
     button is a universal signal that something is missing. -->
```

### WRONG vs CORRECT: When to Show Errors

```svelte
<!-- WRONG: Show errors immediately — the page loads screaming at the user -->
{#if !nameValid}
  <span class="error">Name must be at least 2 characters.</span>
{/if}

<!-- WRONG: Only show errors on submit — no feedback while typing -->
<!-- (This is the alert() approach from earlier) -->

<!-- WRONG: Show errors on every keystroke — annoying while typing a valid name -->
<input oninput={() => nameTouched = true} />

<!-- CORRECT: Show errors on blur — after the user leaves the field -->
<input onblur={() => nameTouched = true} />
{#if nameTouched && !nameValid}
  <span class="error">Name must be at least 2 characters.</span>
{/if}
<!-- The user types, moves on, THEN sees the error. Respectful and helpful. -->

<!-- ALSO CORRECT: Show errors on blur, then update in real-time after first error -->
<!-- This is the ideal UX — once the user knows about the error, give them
     live feedback as they fix it -->
```

## Step 4: Styling

Add polished styles to make the form look professional. Notice the visual feedback system: invalid fields get a red border, valid fields get a green border, and there are smooth transitions between states:

```svelte
<style>
  .form-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h2 {
    margin: 0 0 8px;
    color: #2c3e50;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #555;
  }

  input, select, textarea {
    padding: 10px 12px;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #3498db;
  }

  /* Validation visual feedback */
  .invalid {
    border-color: #e74c3c;
  }

  .valid {
    border-color: #27ae60;
  }

  .error {
    color: #e74c3c;
    font-size: 0.8rem;
  }

  textarea {
    resize: vertical;
  }

  .submit-btn {
    padding: 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .submit-btn:hover:not(:disabled) {
    background: #2980b9;
  }

  .submit-btn:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
  }

  .preview {
    position: sticky;
    top: 24px;
    align-self: start;
  }

  .preview h3 {
    margin: 0 0 12px;
    color: #2c3e50;
  }

  .preview-card {
    padding: 20px;
    background: #f8f9fa;
    border: 1px solid #eee;
    border-radius: 8px;
  }

  .preview-card p {
    margin: 0 0 8px;
    font-size: 0.95rem;
  }

  .preview-message {
    color: #666;
    font-style: italic;
    white-space: pre-wrap;
  }

  .success {
    text-align: center;
    padding: 48px 24px;
    max-width: 500px;
    margin: 0 auto;
  }

  .success h2 {
    color: #27ae60;
  }

  .success button {
    margin-top: 16px;
    padding: 10px 24px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .form-container {
      grid-template-columns: 1fr;
    }
  }
</style>
```

### Understanding the CSS Choices

A few CSS patterns here deserve explanation because they apply to every form you will ever build:

```css
/* 1. Border transitions for validation feedback */
input, select, textarea {
  transition: border-color 0.2s;
}
/* Without the transition, the border snaps from gray to red/green instantly.
   The 0.2s fade feels polished and professional. Small details matter. */

/* 2. Sticky preview panel */
.preview {
  position: sticky;
  top: 24px;
  align-self: start;
}
/* The preview stays visible as the user scrolls through a long form.
   align-self: start prevents the sticky element from stretching to fill
   the grid row height. */

/* 3. The :not(:disabled) pseudo-class chain */
.submit-btn:hover:not(:disabled) {
  background: #2980b9;
}
/* Without :not(:disabled), the hover effect still applies to the disabled
   button, making it look clickable when it is not. This is a subtle but
   important UX detail — the disabled state should feel "dead." */

/* 4. pre-wrap on the message preview */
.preview-message {
  white-space: pre-wrap;
}
/* This preserves line breaks the user types in the textarea.
   Without it, a multi-paragraph message shows as a single block of text
   in the preview, which is confusing. */
```

## The Complete Component

When you put all four steps together in a single `.svelte` file, you get a fully functional contact form with:
- Real-time validation that only shows errors after the user interacts with a field (onblur)
- A live preview that updates as the user fills out the form
- A disabled submit button until all fields are valid
- A success screen after submission with a "Send Another" reset button
- Responsive layout that stacks on mobile
- Accessible error messages with `aria-describedby` and `role="alert"`
- Visual feedback (green/red borders) that transitions smoothly

## Architectural Patterns: Scaling Beyond This Form

This contact form teaches patterns that apply to every form you will build. Let's examine how they scale.

### Pattern 1: Extracted Validation Functions

As forms grow, inline validation becomes hard to read. Extract validation into functions:

```svelte
<script>
  // Validation rules as pure functions — testable and reusable
  function validateName(value) {
    if (value.trim().length === 0) return "Name is required.";
    if (value.trim().length < 2) return "Name must be at least 2 characters.";
    if (value.trim().length > 100) return "Name must be under 100 characters.";
    return "";
  }

  function validateEmail(value) {
    if (value.trim().length === 0) return "Email is required.";
    if (!value.includes("@") || !value.includes(".")) {
      return "Please enter a valid email address.";
    }
    // Check for common typos
    const domain = value.split("@")[1];
    if (domain === "gmial.com") return "Did you mean gmail.com?";
    if (domain === "gamil.com") return "Did you mean gmail.com?";
    return "";
  }

  function validateMessage(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Message is required.";
    if (trimmed.length < 10) return `Message needs ${10 - trimmed.length} more characters.`;
    if (trimmed.length > 2000) return `Message is ${trimmed.length - 2000} characters too long.`;
    return "";
  }

  // Derived errors using the validation functions
  let nameError = $derived(nameTouched ? validateName(name) : "");
  let emailError = $derived(emailTouched ? validateEmail(email) : "");
  let messageError = $derived(messageTouched ? validateMessage(message) : "");

  // Form is valid when ALL errors are empty
  let formValid = $derived(
    validateName(name) === "" &&
    validateEmail(email) === "" &&
    subject !== "" &&
    validateMessage(message) === ""
  );
</script>
```

Now validation functions can be unit tested in isolation:

```typescript
// validation.test.ts
import { validateName, validateEmail, validateMessage } from './validation';

test('name validation', () => {
  expect(validateName("")).toBe("Name is required.");
  expect(validateName("A")).toBe("Name must be at least 2 characters.");
  expect(validateName("Al")).toBe("");
  expect(validateName("A".repeat(101))).toBe("Name must be under 100 characters.");
});

test('email typo detection', () => {
  expect(validateEmail("user@gmial.com")).toBe("Did you mean gmail.com?");
  expect(validateEmail("user@gmail.com")).toBe("");
});
```

### Pattern 2: The Form Data Object Pattern

For larger forms, individual variables become unwieldy. Group them:

```svelte
<script>
  // WRONG for large forms: many individual state variables
  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let address1 = $state("");
  let address2 = $state("");
  let city = $state("");
  let state_ = $state("");
  let zip = $state("");
  // ... 15 more fields

  // CORRECT for large forms: a single form data object
  let form = $state({
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  });

  let touched = $state({
    name: false,
    email: false,
    phone: false,
    // ...
  });

  // Reset is now simple:
  function resetForm() {
    form = { name: "", email: "", phone: "", /* ... */ };
    touched = { name: false, email: false, phone: false, /* ... */ };
  }

  // Derived validation works the same way:
  let nameValid = $derived(form.name.trim().length >= 2);
</script>

<!-- Binding works with object properties -->
<input bind:value={form.name} onblur={() => touched.name = true} />
```

### Pattern 3: Form Submission with Loading States

Real forms submit to a server. Here is the production pattern:

```svelte
<script>
  let submitting = $state(false);
  let submitError = $state("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!formValid || submitting) return;

    submitting = true;
    submitError = "";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Something went wrong");
      }

      submitted = true;
    } catch (err) {
      submitError = err instanceof Error ? err.message : "Failed to send message";
    } finally {
      submitting = false;
    }
  }
</script>

{#if submitError}
  <div class="error-banner" role="alert">{submitError}</div>
{/if}

<button type="submit" disabled={!formValid || submitting}>
  {#if submitting}
    Sending...
  {:else}
    Send Message
  {/if}
</button>
```

### Pattern 4: Preventing Double Submission

Double submission is a real problem. A user clicks "Submit," nothing happens immediately, they click again, and two messages are sent. Three layers of defense:

```svelte
<script>
  let submitting = $state(false);

  async function handleSubmit(event) {
    event.preventDefault();

    // Layer 1: Guard clause — if already submitting, bail out
    if (submitting) return;

    submitting = true;

    try {
      await fetch("/api/contact", { /* ... */ });
      submitted = true;
    } finally {
      submitting = false;
    }
  }
</script>

<!-- Layer 2: Disable the button during submission -->
<button type="submit" disabled={!formValid || submitting}>
  {submitting ? "Sending..." : "Send Message"}
</button>

<!-- Layer 3: Server-side idempotency (not shown here but critical for payments) -->
```

## Edge Cases and Gotchas

### Gotcha 1: bind:value on Select Elements

```svelte
<!-- WRONG: Initial value does not match any option value -->
<script>
  let subject = $state("please-select"); // No option has this value!
</script>
<select bind:value={subject}>
  <option value="" disabled>Select a subject</option>
  <option value="general">General Inquiry</option>
</select>
<!-- The select shows a blank state because no option matches -->

<!-- CORRECT: Initial value matches the disabled option -->
<script>
  let subject = $state(""); // Matches the disabled option
</script>
<select bind:value={subject}>
  <option value="" disabled>Select a subject</option>
  <option value="general">General Inquiry</option>
</select>
```

### Gotcha 2: Textarea Whitespace

```svelte
<!-- WRONG: Whitespace between tags becomes the textarea's initial value -->
<textarea bind:value={message}>
</textarea>
<!-- The textarea starts with a newline character! message === "\n" -->

<!-- CORRECT: Self-closing or no whitespace -->
<textarea bind:value={message}></textarea>
```

### Gotcha 3: Form Reset Does Not Reset bind:value

```svelte
<!-- WRONG: Using the native form reset — it resets the DOM but not Svelte state -->
<form onreset={() => { /* Svelte state is still "John" */ }}>
  <input bind:value={name} />
  <button type="reset">Reset</button>
</form>
<!-- The DOM resets to empty, but name still === "John".
     Svelte then re-renders the input with "John" — it looks like nothing happened. -->

<!-- CORRECT: Reset Svelte state manually -->
<button type="button" onclick={resetForm}>Reset</button>
```

### Gotcha 4: Email Validation Complexity

```svelte
<script>
  // This "simple" regex catches 99% of cases for learning purposes:
  let emailValid = $derived(email.includes("@") && email.includes("."));

  // But it allows clearly invalid emails like "@." or "a@b.c"
  // For production, use a validation library or this more robust check:
  let emailValidProd = $derived(
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  );

  // Even this regex is not perfect. The only true validation for an email
  // address is to send a confirmation email and see if they click the link.
  // Overly strict regex rejects valid addresses like user+tag@domain.co.uk
</script>
```

### Gotcha 5: Mobile Keyboard and Input Types

```svelte
<!-- Using the right input type changes the mobile keyboard -->
<input type="email" />    <!-- Shows @ and . on mobile keyboard -->
<input type="tel" />      <!-- Shows number pad on mobile -->
<input type="url" />      <!-- Shows / and .com on mobile keyboard -->
<input type="text" />     <!-- Generic keyboard — no optimization -->

<!-- These type attributes are free UX improvements on mobile.
     They cost you nothing and make the form easier to fill out. -->
```

## What You Used

This project combined nearly everything from Phase 1:
- **HTML**: form, input, select, textarea, label, button elements with proper accessibility attributes
- **CSS**: Grid layout, Flexbox, scoped styles, transitions, media queries, pseudo-classes (`:disabled`, `:not()`, `:hover`)
- **JavaScript**: `$state()` for reactive form data, `$derived()` for validation, event handlers, async/await for submission
- **Svelte**: `bind:value`, `{#if}/{:else}`, `class:` directives, event handling, `aria-*` attributes
- **UX patterns**: Touched/dirty tracking, progressive validation, loading states, double-submission prevention

## Try It

Build the complete contact form described in this lesson. Then extend it with these challenges:

1. **Phone number field**: Add a phone number input with `type="tel"`. Validate that it contains at least 10 digits (strip non-digit characters before counting). Use the `inputmode="tel"` attribute for the best mobile keyboard.

2. **Newsletter checkbox**: Add a "Subscribe to newsletter" checkbox using `bind:checked`. Show it in the live preview as "Newsletter: Yes/No".

3. **Urgency radio buttons**: Add a radio button group for urgency (Low, Normal, Urgent). Change the preview card's left border color based on the selection (green for low, blue for normal, red for urgent).

4. **Character counter with warning**: Add a max character limit (500) to the message field. Show a counter that turns yellow at 400 characters and red at 480+. Prevent typing beyond 500 characters.

5. **LocalStorage persistence**: Save the form data to `localStorage` on every change (use `$effect`). Restore it when the page loads. Add a "Clear saved data" button. This prevents data loss if the user accidentally refreshes the page.

6. **Animated validation feedback**: Add CSS transitions to the error messages so they fade in instead of appearing abruptly. Use Svelte's `transition:slide` for a polished slide-down effect.

## Key Takeaways

- Every form field is a state machine with three states: pristine, dirty+valid, dirty+invalid — track "touched" state to show errors only after the user interacts with a field
- Use `$derived()` for validation rules, never `$effect()` — validation is derived data, not a side effect, and `$derived` eliminates timing gaps between value changes and validation updates
- Use `onblur` (not `oninput`) to mark fields as touched — showing errors while the user is still typing their first character is hostile UX
- Combine `$state()` and `bind:value` to create a two-way binding between the DOM and your component state
- Show validation errors conditionally with `{#if}` — use `aria-describedby` and `role="alert"` so screen readers announce errors
- Disable the submit button using the `disabled` attribute and a derived `formValid` boolean — this is visual feedback that "something is missing"
- Use `event.preventDefault()` to handle form submission in JavaScript — without it, the browser submits the form as a traditional page navigation
- A live preview gives users immediate feedback and builds confidence in the form data before submission
- For large forms, group state into objects instead of individual variables — it simplifies reset logic and serialization
- Always handle loading states and double-submission prevention in forms that submit to a server
- Use the right `type` attribute on inputs (`email`, `tel`, `url`) — it costs nothing and gives mobile users an optimized keyboard
- This pattern of state, binding, derived validation, touched tracking, and conditional rendering is the foundation of every interactive form you will ever build
