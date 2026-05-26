# Input Elements

Almost every website needs some way for users to enter data — signing up, searching, filling out a contact form, writing a comment. HTML provides a rich set of **form elements** for exactly this: text fields, dropdowns, checkboxes, radio buttons, and more.

In this lesson you will learn every common form element and how to structure them properly. Good form design means clear labels, logical grouping, and accessible markup so that everyone — including users with screen readers — can interact with your forms.

## The Form Element

All form inputs should live inside a `<form>` tag. This groups them together and enables submission. The `<form>` tag is not just organizational — it is essential for accessibility, browser autofill, password managers, and keyboard submission (pressing Enter in a text field submits the form).

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

Always use `event.preventDefault()` to stop the page from reloading when the form is submitted. Without it, the browser performs a full page navigation to the form's `action` URL — the default browser behavior from before single-page applications existed.

**Why not just use a `<div>` with a click handler?** Because you lose all of these for free:
- Enter-key submission from any text input
- Browser autofill and password managers
- Accessibility — screen readers announce form boundaries
- The `FormData` API for easy data collection
- Progressive enhancement in SvelteKit (forms work without JavaScript)

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

  <label for="search">Search</label>
  <input type="search" id="search" placeholder="Search articles..." />

  <label for="phone">Phone</label>
  <input type="tel" id="phone" placeholder="+1 (555) 000-0000" />

  <label for="website">Website</label>
  <input type="url" id="website" placeholder="https://example.com" />
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

  input:focus {
    outline: 2px solid #3498db;
    outline-offset: 1px;
    border-color: #3498db;
  }
</style>
```

Each `type` value gives different behavior:
- **`text`** — generic single-line text
- **`email`** — validates email format, shows `@` key on mobile keyboards
- **`password`** — hides typed characters
- **`search`** — may show a clear button, semantically marks search
- **`tel`** — shows numeric phone keyboard on mobile
- **`url`** — validates URL format, shows `.com` key on mobile

The `for` attribute on `<label>` must match the `id` of the input. This connects them — clicking the label focuses the input, and screen readers announce the label when the input is focused.

## Textarea

For multi-line text like messages, bios, or comments:

```svelte
<label for="message">Your Message</label>
<textarea id="message" rows="5" placeholder="Write your message here..."></textarea>

<label for="bio">Bio</label>
<textarea id="bio" rows="3" maxlength="280" placeholder="Tell us about yourself..."></textarea>

<style>
  textarea {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit; /* critical — textareas default to monospace */
    resize: vertical;
    width: 100%;
  }

  textarea:focus {
    outline: 2px solid #3498db;
    outline-offset: 1px;
    border-color: #3498db;
  }
</style>
```

The `rows` attribute sets the initial visible height. Use `resize: vertical` in CSS to let users resize only vertically (preventing horizontal resize that breaks layouts). The `maxlength` attribute limits character count — combine it with a character counter for good UX.

**Common mistake**: Forgetting `font-family: inherit` on textareas. Browsers default textareas to a monospace font, which looks inconsistent with the rest of your form. Always set `font-family: inherit` to match your site's typography.

## Number Input

For numeric values. The browser provides increment/decrement buttons and validates that the input is a number:

```svelte
<script>
  let quantity = $state(1);
</script>

<label for="quantity">Quantity</label>
<input
  type="number"
  id="quantity"
  bind:value={quantity}
  min="1"
  max="99"
  step="1"
/>

<label for="price">Price</label>
<input type="number" id="price" min="0" max="10000" step="0.01" />

<label for="temperature">Temperature (°C)</label>
<input type="number" id="temperature" min="-50" max="50" step="0.5" />

<style>
  input[type="number"] {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    width: 120px;
  }
</style>
```

The `step` attribute controls the increment size. Use `step="0.01"` for currency, `step="0.5"` for half-unit increments, and `step="any"` to accept any decimal.

**Gotcha**: Number inputs return strings in JavaScript. When reading the value from `FormData`, you must convert: `Number(formData.get('quantity'))`. Svelte's `bind:value` handles this conversion automatically.

## Select (Dropdown)

When users need to choose from a predefined list:

```svelte
<script>
  let country = $state('');
</script>

<label for="country">Country</label>
<select id="country" bind:value={country}>
  <option value="" disabled>Choose a country</option>
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
  <option value="ca">Canada</option>
  <option value="au">Australia</option>
</select>

<p>Selected: {country || 'None'}</p>

<style>
  select {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    background: white;
    width: 100%;
    cursor: pointer;
  }
</style>
```

For longer lists, group related options with `<optgroup>`:

```svelte
<label for="timezone">Timezone</label>
<select id="timezone">
  <option value="" disabled selected>Select timezone</option>
  <optgroup label="Americas">
    <option value="est">Eastern (EST)</option>
    <option value="cst">Central (CST)</option>
    <option value="pst">Pacific (PST)</option>
  </optgroup>
  <optgroup label="Europe">
    <option value="gmt">Greenwich (GMT)</option>
    <option value="cet">Central European (CET)</option>
  </optgroup>
</select>
```

For multi-select, add the `multiple` attribute. Users hold Ctrl/Cmd to select multiple options:

```svelte
<label for="skills">Skills (select multiple)</label>
<select id="skills" multiple size="5">
  <option value="html">HTML</option>
  <option value="css">CSS</option>
  <option value="js">JavaScript</option>
  <option value="svelte">Svelte</option>
  <option value="node">Node.js</option>
</select>
```

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
    padding: 6px 0;
    cursor: pointer;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    vertical-align: middle;
    accent-color: #3498db;
  }
</style>
```

Wrapping the checkbox inside the `<label>` automatically connects them — no `for`/`id` pairing needed. The `accent-color` CSS property changes the checkbox color without custom styling.

**Single checkbox for boolean values** — Use a single checkbox for toggles like "I agree to terms" or "Enable notifications". These map to a single boolean, not a group:

```svelte
<script>
  let agreed = $state(false);
</script>

<label>
  <input type="checkbox" bind:checked={agreed} />
  I agree to the <a href="/terms">Terms of Service</a>
</label>

<button type="submit" disabled={!agreed}>Continue</button>
```

## Radio Buttons

For choosing exactly one option from a group. All radios in a group share the same `name`:

```svelte
<fieldset>
  <legend>Preferred Contact Method</legend>

  <label>
    <input type="radio" name="contact" value="email" checked /> Email
  </label>

  <label>
    <input type="radio" name="contact" value="phone" /> Phone
  </label>

  <label>
    <input type="radio" name="contact" value="text" /> Text Message
  </label>
</fieldset>

<style>
  label {
    display: block;
    padding: 6px 0;
    cursor: pointer;
  }

  input[type="radio"] {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    vertical-align: middle;
    accent-color: #3498db;
  }
</style>
```

The `name` attribute is critical for radio buttons — it tells the browser these options belong to the same group. Only one radio with the same `name` can be selected at a time.

**Radio vs Select**: Use radio buttons when there are 2-5 options and the user benefits from seeing all choices at once. Use a select dropdown when there are more than 5 options, or when space is limited.

## Range Input

For selecting a value within a range, displayed as a slider:

```svelte
<script>
  let volume = $state(50);
  let brightness = $state(75);
</script>

<div class="slider-group">
  <label for="volume">Volume: {volume}%</label>
  <input type="range" id="volume" bind:value={volume} min="0" max="100" step="1" />
</div>

<div class="slider-group">
  <label for="brightness">Brightness: {brightness}%</label>
  <input type="range" id="brightness" bind:value={brightness} min="0" max="100" step="5" />
</div>

<style>
  .slider-group {
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #3498db;
    cursor: pointer;
  }
</style>
```

Always show the current value next to the slider — users cannot tell the exact value from the slider position alone.

## Date and Time Inputs

HTML provides native date and time pickers:

```svelte
<script>
  let startDate = $state('');
  let meetingTime = $state('');
  let appointmentDatetime = $state('');
</script>

<label for="start">Start Date</label>
<input type="date" id="start" bind:value={startDate} min="2024-01-01" max="2026-12-31" />

<label for="time">Meeting Time</label>
<input type="time" id="time" bind:value={meetingTime} min="09:00" max="17:00" />

<label for="datetime">Appointment</label>
<input type="datetime-local" id="datetime" bind:value={appointmentDatetime} />

<label for="month">Birth Month</label>
<input type="month" id="month" />

<label for="week">Week</label>
<input type="week" id="week" />

<style>
  input[type="date"],
  input[type="time"],
  input[type="datetime-local"],
  input[type="month"],
  input[type="week"] {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
  }
</style>
```

**Note**: Date/time inputs return strings in ISO format (`2024-06-15`, `14:30`, `2024-06-15T14:30`). Browser styling varies significantly — for consistent design across browsers, many teams use custom date picker components.

## File Input

For uploading files:

```svelte
<script>
  let files = $state(null);
  let preview = $derived(files?.[0] ? URL.createObjectURL(files[0]) : null);
</script>

<label for="avatar" class="file-label">
  Upload Avatar
  <input
    type="file"
    id="avatar"
    accept="image/*"
    bind:files
  />
</label>

{#if preview}
  <img src={preview} alt="Preview" class="preview" />
{/if}

<!-- Multiple files -->
<label for="docs" class="file-label">
  Upload Documents
  <input type="file" id="docs" accept=".pdf,.doc,.docx" multiple />
</label>

<style>
  .file-label {
    display: inline-block;
    padding: 10px 20px;
    background: #3498db;
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .file-label input[type="file"] {
    display: none; /* Hide the ugly default, use label as button */
  }

  .preview {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border-radius: 50%;
    margin-top: 12px;
  }
</style>
```

The `accept` attribute restricts file types. `image/*` allows any image. `.pdf,.doc` restricts to specific extensions. `multiple` allows selecting several files at once.

**Hidden file input pattern**: The native file input is notoriously hard to style. The common approach is to hide it with `display: none` and style the `<label>` as a button — clicking the label triggers the file dialog.

## Color Input

For selecting a color:

```svelte
<script>
  let color = $state('#3498db');
</script>

<label for="color">Theme Color</label>
<input type="color" id="color" bind:value={color} />
<p>Selected: {color}</p>

<div class="preview" style:background-color={color}>
  Preview
</div>

<style>
  input[type="color"] {
    width: 60px;
    height: 40px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px;
  }

  .preview {
    padding: 20px;
    color: white;
    border-radius: 8px;
    text-align: center;
    margin-top: 12px;
  }
</style>
```

## Accessibility: Labels, Fieldsets, and Error Messages

Proper form accessibility is not optional — it is a legal requirement in many jurisdictions. Here are the essential patterns:

**Every input needs a label.** Screen readers rely on labels to announce what each input is for. There are two approaches:

```svelte
<!-- Approach 1: for/id pairing -->
<label for="email">Email Address</label>
<input type="email" id="email" />

<!-- Approach 2: Wrapping (no id needed) -->
<label>
  Email Address
  <input type="email" />
</label>

<!-- WRONG: No label at all. Screen readers say "edit text, blank" -->
<input type="email" placeholder="Email" />
```

**Placeholder is NOT a label.** Placeholders disappear when the user types, leaving no indication of what the field is for. Always use a `<label>` in addition to any placeholder.

**Fieldsets group related inputs** and are essential for radio button and checkbox groups:

```svelte
<fieldset>
  <legend>Shipping Address</legend>
  <label for="street">Street</label>
  <input type="text" id="street" />
  <label for="city">City</label>
  <input type="text" id="city" />
  <label for="zip">ZIP Code</label>
  <input type="text" id="zip" />
</fieldset>
```

**Error messages must be linked to their input** using `aria-describedby`:

```svelte
<label for="username">Username</label>
<input
  type="text"
  id="username"
  aria-invalid={hasError}
  aria-describedby={hasError ? 'username-error' : undefined}
/>
{#if hasError}
  <span id="username-error" class="error" role="alert">
    Username must be 3-20 characters
  </span>
{/if}
```

The `aria-invalid` attribute tells screen readers the field has an error. `aria-describedby` links the error message so it is read aloud when the user focuses the input.

## Form Layout Best Practices

A well-structured form follows these principles:

```svelte
<form onsubmit={handleSubmit} novalidate>
  <!-- Group related fields with fieldsets -->
  <fieldset>
    <legend>Personal Information</legend>

    <div class="field">
      <label for="fname">First Name <span class="required">*</span></label>
      <input type="text" id="fname" required autocomplete="given-name" />
    </div>

    <div class="field">
      <label for="lname">Last Name <span class="required">*</span></label>
      <input type="text" id="lname" required autocomplete="family-name" />
    </div>

    <div class="field">
      <label for="email2">Email <span class="required">*</span></label>
      <input type="email" id="email2" required autocomplete="email" />
      <span class="hint">We will never share your email</span>
    </div>
  </fieldset>

  <fieldset>
    <legend>Preferences</legend>

    <div class="field">
      <label for="lang">Preferred Language</label>
      <select id="lang" autocomplete="language">
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
      </select>
    </div>
  </fieldset>

  <div class="actions">
    <button type="submit">Create Account</button>
    <button type="reset">Reset</button>
  </div>
</form>

<style>
  form {
    max-width: 500px;
  }

  fieldset {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
  }

  legend {
    font-weight: 700;
    font-size: 1.1rem;
    padding: 0 8px;
    color: #1e293b;
  }

  .field {
    margin-bottom: 16px;
  }

  .field label {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 0.9rem;
  }

  .required {
    color: #ef4444;
  }

  .hint {
    display: block;
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 4px;
  }

  input, select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  button[type="submit"] {
    padding: 12px 24px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }

  button[type="reset"] {
    padding: 12px 24px;
    background: white;
    color: #666;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
</style>
```

Key patterns in this form:
- **`novalidate`** on the form disables browser-native validation popups so you can use your own styled error messages
- **`autocomplete`** attributes help browsers and password managers fill fields automatically
- **Required fields** are marked with a red asterisk and the `required` attribute
- **Hint text** provides additional context below inputs
- **Logical grouping** with fieldsets keeps related fields together
- **Action buttons** are right-aligned with the primary action visually emphasized

## Complete Multi-Step Form

Here is a production-quality multi-step form pattern:

```svelte
<script>
  let step = $state(1);
  const totalSteps = 3;

  // Step 1: Personal Info
  let name = $state('');
  let email = $state('');

  // Step 2: Preferences
  let plan = $state('free');
  let interests = $state([]);

  // Step 3: Confirmation
  let agreed = $state(false);

  function next() { if (step < totalSteps) step++; }
  function prev() { if (step > 1) step--; }

  function handleSubmit(event) {
    event.preventDefault();
    console.log({ name, email, plan, interests, agreed });
  }
</script>

<form onsubmit={handleSubmit}>
  <!-- Progress indicator -->
  <div class="progress">
    {#each Array(totalSteps) as _, i}
      <div class="step-dot" class:active={i + 1 <= step}>
        {i + 1}
      </div>
      {#if i < totalSteps - 1}
        <div class="step-line" class:active={i + 1 < step}></div>
      {/if}
    {/each}
  </div>

  <!-- Step 1 -->
  {#if step === 1}
    <fieldset>
      <legend>Personal Information</legend>
      <div class="field">
        <label for="s-name">Full Name</label>
        <input type="text" id="s-name" bind:value={name} required />
      </div>
      <div class="field">
        <label for="s-email">Email</label>
        <input type="email" id="s-email" bind:value={email} required />
      </div>
    </fieldset>
  {/if}

  <!-- Step 2 -->
  {#if step === 2}
    <fieldset>
      <legend>Choose Your Plan</legend>
      <label class="plan-option">
        <input type="radio" bind:group={plan} value="free" />
        <span><strong>Free</strong> — Basic access</span>
      </label>
      <label class="plan-option">
        <input type="radio" bind:group={plan} value="pro" />
        <span><strong>Pro</strong> — All features</span>
      </label>
      <label class="plan-option">
        <input type="radio" bind:group={plan} value="team" />
        <span><strong>Team</strong> — Collaboration tools</span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Interests</legend>
      {#each ['Frontend', 'Backend', 'DevOps', 'Design'] as interest}
        <label class="check-option">
          <input type="checkbox" bind:group={interests} value={interest} />
          {interest}
        </label>
      {/each}
    </fieldset>
  {/if}

  <!-- Step 3 -->
  {#if step === 3}
    <div class="summary">
      <h3>Confirm Your Details</h3>
      <dl>
        <dt>Name</dt>
        <dd>{name}</dd>
        <dt>Email</dt>
        <dd>{email}</dd>
        <dt>Plan</dt>
        <dd>{plan}</dd>
        <dt>Interests</dt>
        <dd>{interests.join(', ') || 'None'}</dd>
      </dl>

      <label class="check-option">
        <input type="checkbox" bind:checked={agreed} />
        I agree to the Terms of Service
      </label>
    </div>
  {/if}

  <!-- Navigation -->
  <div class="nav-buttons">
    {#if step > 1}
      <button type="button" class="btn-secondary" onclick={prev}>Back</button>
    {/if}
    <div class="spacer"></div>
    {#if step < totalSteps}
      <button type="button" class="btn-primary" onclick={next}>Continue</button>
    {:else}
      <button type="submit" class="btn-primary" disabled={!agreed}>Submit</button>
    {/if}
  </div>
</form>

<style>
  form {
    max-width: 500px;
    margin: 0 auto;
    padding: 24px;
  }

  .progress {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 32px;
    gap: 0;
  }

  .step-dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #e2e8f0;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.9rem;
    transition: all 0.3s;
  }

  .step-dot.active {
    background: #3498db;
    color: white;
  }

  .step-line {
    height: 3px;
    width: 60px;
    background: #e2e8f0;
    transition: background 0.3s;
  }

  .step-line.active {
    background: #3498db;
  }

  fieldset {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
  }

  legend {
    font-weight: 700;
    padding: 0 8px;
  }

  .field {
    margin-bottom: 16px;
  }

  .field label {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .field input {
    width: 100%;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  .plan-option, .check-option {
    display: block;
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
  }

  .plan-option:hover, .check-option:hover {
    background: #f8fafc;
  }

  .summary dl {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 8px;
  }

  .summary dt { font-weight: 600; color: #475569; }
  .summary dd { margin: 0; }

  .nav-buttons {
    display: flex;
    margin-top: 24px;
  }

  .spacer { flex: 1; }

  .btn-primary {
    padding: 12px 24px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 12px 24px;
    background: white;
    color: #333;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
</style>
```

This multi-step form demonstrates:
- **Progress indicator** showing which step the user is on
- **Conditional rendering** to show only the current step
- **State preservation** — moving between steps does not lose data
- **Confirmation step** before final submission
- **Disabled submit** until terms are accepted
- **Back/Continue navigation** with appropriate button types (`type="button"` to prevent form submission)

## Try It

Build a "Registration Form" component with:
- Text inputs for first name, last name, and email (with labels and `autocomplete` attributes)
- A password input with a "Show/Hide" toggle button
- A select dropdown for "How did you hear about us?" with at least 5 options grouped with `<optgroup>`
- Checkboxes for interests (at least 4 options) wrapped in a `<fieldset>` with `<legend>`
- Radio buttons for newsletter frequency (daily, weekly, monthly, never)
- A range slider for "years of experience" (0-20) displaying the current value
- A submit button that is disabled until a required "agree to terms" checkbox is checked
- Proper `aria-describedby` on at least one field with a hint message
- Styled focus states on all inputs

## Key Takeaways

- Wrap all inputs in a `<form>` tag — it enables keyboard submission, autofill, and accessibility
- Always pair `<label>` with inputs using `for`/`id` or by nesting the input inside the label — placeholders are not labels
- Use `<textarea>` for multi-line text, `<select>` for dropdowns, `<input type="file">` for uploads
- Checkboxes are independent toggles; radio buttons (sharing a `name`) allow one selection from a group
- `<fieldset>` and `<legend>` group related inputs — required for radio/checkbox groups in accessible forms
- Use HTML input types like `email`, `number`, `date`, `tel`, `url` for built-in validation and mobile keyboard optimization
- Mark required fields visually (asterisk) and semantically (`required` attribute)
- Link error messages to inputs with `aria-describedby` and mark invalid fields with `aria-invalid`
- Use `autocomplete` attributes to help browsers and password managers fill fields correctly
- Hide native file inputs and style the label as a button for consistent file upload UX
