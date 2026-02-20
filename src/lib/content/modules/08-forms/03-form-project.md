# Contact Form Project

It is time to put everything together. In this project, you will build a complete **contact form** with real-time validation and a live preview. This combines nearly every concept you have learned: HTML form elements, CSS styling, `$state()`, `$derived()`, `bind:value`, `{#if}` blocks, and component structure.

This is the kind of form you will build over and over in real-world projects — signing up users, collecting feedback, processing orders. Nail this pattern and you are ready for anything.

## The Goal

We are building a contact form with:
1. Name, email, and message fields
2. A subject dropdown
3. Validation that shows errors as the user types
4. A live preview panel that shows what will be submitted
5. A submit button that is disabled until the form is valid

## Step 1: Form State

Start by defining all the state your form needs:

```svelte
<script>
  let name = $state("");
  let email = $state("");
  let subject = $state("");
  let message = $state("");
  let submitted = $state(false);
</script>
```

## Step 2: Validation with $derived()

Use derived state to compute validation status in real time:

```svelte
<script>
  let name = $state("");
  let email = $state("");
  let subject = $state("");
  let message = $state("");
  let submitted = $state(false);

  // Validation rules
  let nameValid = $derived(name.trim().length >= 2);
  let emailValid = $derived(email.includes("@") && email.includes("."));
  let subjectValid = $derived(subject !== "");
  let messageValid = $derived(message.trim().length >= 10);

  // Overall form validity
  let formValid = $derived(nameValid && emailValid && subjectValid && messageValid);

  // Character count
  let messageLength = $derived(message.trim().length);

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
  }
</script>
```

## Step 3: The Form Markup

Build the form with bound inputs and validation messages:

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

      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="Your full name"
          class:invalid={name.length > 0 && !nameValid}
        />
        {#if name.length > 0 && !nameValid}
          <span class="error">Name must be at least 2 characters.</span>
        {/if}
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          class:invalid={email.length > 0 && !emailValid}
        />
        {#if email.length > 0 && !emailValid}
          <span class="error">Please enter a valid email address.</span>
        {/if}
      </div>

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

      <div class="field">
        <label for="message">Message ({messageLength}/10 min characters)</label>
        <textarea
          id="message"
          bind:value={message}
          placeholder="Tell us what's on your mind..."
          rows="5"
          class:invalid={message.length > 0 && !messageValid}
        ></textarea>
        {#if message.length > 0 && !messageValid}
          <span class="error">Message must be at least 10 characters.</span>
        {/if}
      </div>

      <button type="submit" class="submit-btn" disabled={!formValid}>
        Send Message
      </button>
    </form>

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

## Step 4: Styling

Add polished styles to make the form look professional:

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

  .invalid {
    border-color: #e74c3c;
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

## The Complete Component

When you put all four steps together in a single `.svelte` file, you get a fully functional contact form with:
- Real-time validation that only shows errors after the user starts typing
- A live preview that updates as the user fills out the form
- A disabled submit button until all fields are valid
- A success screen after submission with a "Send Another" reset button
- Responsive layout that stacks on mobile

## What You Used

This project combined nearly everything from Phase 1:
- **HTML**: form, input, select, textarea, label, button elements
- **CSS**: Grid layout, Flexbox, scoped styles, transitions, media queries, pseudo-classes
- **JavaScript**: $state() for reactive form data, $derived() for validation
- **Svelte**: bind:value, {#if}/{:else}, class: directives, event handling

## Challenge: Extend It

Take this form further by adding:
- A "phone number" field with a pattern validator
- A checkbox for "Subscribe to newsletter"
- An "urgency" radio button group (low, normal, urgent) that changes the preview card border color
- A character counter for the message that turns red above 500 characters
- Form data that persists using `localStorage`

## Key Takeaways

- Combine `$state()` and `bind:value` to track form inputs reactively
- Use `$derived()` to create real-time validation rules
- Show validation errors conditionally with `{#if}` — only after the user interacts with the field
- Disable the submit button using the `disabled` attribute and a derived `formValid` boolean
- Use `event.preventDefault()` to handle form submission in JavaScript
- A live preview gives users immediate feedback and builds confidence in the form
- This pattern of state, binding, derived validation, and conditional rendering is the foundation of every interactive form you will ever build
