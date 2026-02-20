# Input Elements

Almost every website needs some way for users to enter data — signing up, searching, filling out a contact form, writing a comment. HTML provides a rich set of **form elements** for exactly this: text fields, dropdowns, checkboxes, radio buttons, and more.

In this lesson you will learn every common form element and how to structure them properly. Good form design means clear labels, logical grouping, and accessible markup so that everyone — including users with screen readers — can interact with your forms.

## The form Element

All form inputs should live inside a `<form>` tag. This groups them together and enables submission:

```svelte
<script>
  function handleSubmit(event) {
    event.preventDefault();
    // Handle form data here
  }
</script>

<form onsubmit={handleSubmit}>
  <!-- inputs go here -->
  <button type="submit">Submit</button>
</form>
```

Always use `event.preventDefault()` to stop the page from reloading when the form is submitted.

## Text Input

The most basic form element. Use it for short text like names, emails, and search queries:

```svelte
<form>
  <label for="name">Full Name</label>
  <input type="text" id="name" placeholder="Enter your name" />

  <label for="email">Email</label>
  <input type="email" id="email" placeholder="you@example.com" />

  <label for="password">Password</label>
  <input type="password" id="password" placeholder="Enter password" />
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
  }

  label {
    font-weight: bold;
    font-size: 0.9rem;
  }

  input {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
  }
</style>
```

The `for` attribute on `<label>` must match the `id` of the input. This connects them — clicking the label focuses the input, and screen readers announce the label when the input is focused.

## Textarea

For multi-line text like messages, bios, or comments:

```svelte
<label for="message">Your Message</label>
<textarea id="message" rows="5" placeholder="Write your message here..."></textarea>

<style>
  textarea {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
    resize: vertical;
    width: 100%;
  }
</style>
```

The `rows` attribute sets the initial visible height. Use `resize: vertical` in CSS to let users resize only vertically.

## Select (Dropdown)

When users need to choose from a predefined list:

```svelte
<label for="country">Country</label>
<select id="country">
  <option value="" disabled selected>Choose a country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
  <option value="ca">Canada</option>
  <option value="au">Australia</option>
</select>

<style>
  select {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    background: white;
    width: 100%;
  }
</style>
```

The first `<option>` with `disabled selected` acts as placeholder text.

## Checkboxes

For toggling options on and off. Each checkbox works independently:

```svelte
<fieldset>
  <legend>Interests</legend>

  <label>
    <input type="checkbox" value="coding" /> Coding
  </label>

  <label>
    <input type="checkbox" value="design" /> Design
  </label>

  <label>
    <input type="checkbox" value="music" /> Music
  </label>
</fieldset>

<style>
  fieldset {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
  }

  legend {
    font-weight: bold;
    padding: 0 8px;
  }

  label {
    display: block;
    padding: 4px 0;
    cursor: pointer;
  }
</style>
```

Wrapping the checkbox inside the `<label>` automatically connects them — no `for`/`id` pairing needed.

## Radio Buttons

For choosing exactly one option from a group. All radios in a group share the same `name`:

```svelte
<fieldset>
  <legend>Preferred Contact Method</legend>

  <label>
    <input type="radio" name="contact" value="email" /> Email
  </label>

  <label>
    <input type="radio" name="contact" value="phone" /> Phone
  </label>

  <label>
    <input type="radio" name="contact" value="text" /> Text Message
  </label>
</fieldset>
```

The `name` attribute is critical for radio buttons — it tells the browser these options belong to the same group.

## Other Input Types

HTML provides specialized input types with built-in validation:

```svelte
<label for="date">Date</label>
<input type="date" id="date" />

<label for="number">Quantity</label>
<input type="number" id="number" min="1" max="10" value="1" />

<label for="range">Volume</label>
<input type="range" id="range" min="0" max="100" value="50" />

<label for="color">Favorite Color</label>
<input type="color" id="color" value="#3498db" />
```

## A Complete Form

Here is everything put together in a well-structured form:

```svelte
<script>
  function handleSubmit(event) {
    event.preventDefault();
  }
</script>

<form onsubmit={handleSubmit}>
  <label for="fullname">Full Name</label>
  <input type="text" id="fullname" required />

  <label for="email">Email</label>
  <input type="email" id="email" required />

  <label for="topic">Topic</label>
  <select id="topic">
    <option value="" disabled selected>Select a topic</option>
    <option value="general">General Inquiry</option>
    <option value="support">Technical Support</option>
    <option value="feedback">Feedback</option>
  </select>

  <label for="msg">Message</label>
  <textarea id="msg" rows="4" required></textarea>

  <label>
    <input type="checkbox" /> I agree to the terms and conditions
  </label>

  <button type="submit">Send Message</button>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 500px;
    padding: 24px;
    border: 1px solid #ddd;
    border-radius: 10px;
  }

  label { font-weight: 600; font-size: 0.9rem; }
  input, select, textarea {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
  }

  button {
    padding: 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
  }

  button:hover { background: #2980b9; }
</style>
```

## Try It

Build a "Registration Form" component with:
- Text inputs for name and email (with labels)
- A password input
- A select dropdown for "How did you hear about us?"
- Checkboxes for interests
- Radio buttons for newsletter frequency (daily, weekly, monthly)
- A submit button with styled hover state

## Key Takeaways

- Wrap all inputs in a `<form>` tag and use `event.preventDefault()` on submit
- Always pair `<label>` with inputs using `for`/`id` or by nesting the input inside the label
- Use `<textarea>` for multi-line text, `<select>` for dropdowns
- Checkboxes are independent toggles; radio buttons (sharing a `name`) allow one selection
- `<fieldset>` and `<legend>` group related inputs together
- Use HTML input types like `email`, `number`, `date` for built-in validation
