# Two-Way Binding

In the last lesson, you created form elements, but you had no way to read what the user typed. You could listen for events with `oninput`, but Svelte offers something much more elegant: **two-way binding**. With the `bind:` directive, a variable and a form input stay perfectly in sync — change the variable and the input updates; type in the input and the variable updates.

This is one of Svelte's most loved features. It eliminates the boilerplate of manually reading input values and updating state, letting you focus on building your UI.

## How Two-Way Binding Works Under the Hood

When you write `bind:value={name}`, Svelte generates two things for you:

1. A **value setter** that updates the DOM element whenever `name` changes (the "state to DOM" direction)
2. An **event listener** that updates `name` whenever the user types in the input (the "DOM to state" direction)

This is functionally equivalent to:

```svelte
<!-- What bind:value does behind the scenes -->
<input
  value={name}
  oninput={(e) => name = e.target.value}
/>
```

But `bind:value={name}` is cleaner, less error-prone, and lets the compiler optimize the update path. Understanding this equivalence helps when you need to debug binding issues — if a binding is not working, check whether the underlying event would fire.

## bind:value for Text Inputs

The `bind:value` directive connects an input's value to a variable:

```svelte
<script>
  let name = $state('');
  let email = $state('');
</script>

<label for="name">Your name:</label>
<input id="name" type="text" bind:value={name} />

<label for="email">Your email:</label>
<input id="email" type="email" bind:value={email} />

<p>Hello, {name || 'stranger'}! We will email {email || '...'}</p>
```

As the user types, `name` and `email` update instantly. The paragraph below the inputs shows the values in real time. No `oninput` handler needed.

**Shorthand syntax**: When the variable name matches the attribute, you can use the shorthand. Since `value` is the attribute name, this is mostly useful with component bindings where your variable is called `value`:

```svelte
<script>
  let value = $state('');
</script>

<!-- These are equivalent: -->
<input bind:value={value} />
<input bind:value />
```

## bind:value with Textarea and Select

It works the same way with textareas and select dropdowns:

```svelte
<script>
  let message = $state('');
  let priority = $state('medium');

  let charCount = $derived(message.length);
  let charLimit = 500;
</script>

<label for="msg">Message ({charCount}/{charLimit}):</label>
<textarea
  id="msg"
  bind:value={message}
  rows="4"
  maxlength={charLimit}
></textarea>

<label for="pri">Priority:</label>
<select id="pri" bind:value={priority}>
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>
  <option value="critical">Critical</option>
</select>

<div class="preview">
  <p><strong>Priority:</strong> {priority}</p>
  <p><strong>Message:</strong> {message || '(empty)'}</p>
</div>

<style>
  .preview {
    margin-top: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #eee;
  }

  textarea, select {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    margin-bottom: 12px;
  }

  label {
    display: block;
    font-weight: bold;
    margin-bottom: 4px;
  }
</style>
```

**Select with objects**: You can bind select values to objects, not just strings. Svelte compares by reference:

```svelte
<script>
  let colors = [
    { name: 'Red', hex: '#e74c3c' },
    { name: 'Blue', hex: '#3498db' },
    { name: 'Green', hex: '#27ae60' }
  ];

  let selected = $state(colors[0]);
</script>

<select bind:value={selected}>
  {#each colors as color}
    <option value={color}>{color.name}</option>
  {/each}
</select>

<div style:background={selected.hex} class="swatch">
  {selected.name}: {selected.hex}
</div>
```

This is a powerful pattern for dropdowns where each option carries more data than just a label.

**Multiple select**: With the `multiple` attribute, `bind:value` binds to an array:

```svelte
<script>
  let selectedFruits = $state([]);
</script>

<label for="fruits">Favorite fruits (Ctrl+click to select multiple):</label>
<select id="fruits" multiple bind:value={selectedFruits}>
  <option value="apple">Apple</option>
  <option value="banana">Banana</option>
  <option value="cherry">Cherry</option>
  <option value="date">Date</option>
</select>

<p>Selected: {selectedFruits.join(', ') || 'none'}</p>
```

## bind:checked for Checkboxes

Checkboxes use `bind:checked` instead of `bind:value`, since they represent a boolean (on/off):

```svelte
<script>
  let darkMode = $state(false);
  let showNotifications = $state(true);
  let agreeToTerms = $state(false);
</script>

<div class="settings" class:dark={darkMode}>
  <h2>Settings</h2>

  <label class="toggle">
    <input type="checkbox" bind:checked={darkMode} />
    <span>Dark Mode</span>
  </label>

  <label class="toggle">
    <input type="checkbox" bind:checked={showNotifications} />
    <span>Show Notifications</span>
  </label>

  <label class="toggle">
    <input type="checkbox" bind:checked={agreeToTerms} />
    <span>I agree to the terms</span>
  </label>

  <p>Dark: {darkMode} | Notifications: {showNotifications} | Terms: {agreeToTerms}</p>
</div>

<style>
  .settings {
    padding: 20px;
    background: white;
    color: #333;
    border-radius: 8px;
    border: 1px solid #ddd;
    max-width: 400px;
    transition: all 0.3s;
  }

  .settings.dark {
    background: #2c3e50;
    color: #ecf0f1;
    border-color: #34495e;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    cursor: pointer;
  }
</style>
```

Toggling the "Dark Mode" checkbox instantly applies the dark theme. That is `bind:checked` plus `class:dark` working together.

**Common mistake**: Using `bind:value` on a checkbox instead of `bind:checked`. A checkbox's `value` is its form submission value (the string sent to the server), not its checked state. If you write `bind:value` on a checkbox, you will get the string value, not a boolean.

## bind:group for Radio Buttons

Radio buttons that share a group bind to the **same variable**. The variable holds whichever value is selected:

```svelte
<script>
  let selectedColor = $state('blue');
  let shirtSize = $state('md');
</script>

<fieldset>
  <legend>Choose a color:</legend>

  {#each ['red', 'green', 'blue', 'purple'] as color}
    <label>
      <input type="radio" bind:group={selectedColor} value={color} />
      {color.charAt(0).toUpperCase() + color.slice(1)}
    </label>
  {/each}
</fieldset>

<div class="preview" style:background-color={selectedColor}>
  Selected: {selectedColor}
</div>

<fieldset>
  <legend>Shirt size:</legend>

  {#each [
    { value: 'xs', label: 'Extra Small' },
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'Extra Large' }
  ] as size}
    <label>
      <input type="radio" bind:group={shirtSize} value={size.value} />
      {size.label}
    </label>
  {/each}
</fieldset>

<p>Size: {shirtSize}</p>

<style>
  .preview {
    margin-top: 16px;
    padding: 20px;
    color: white;
    text-align: center;
    border-radius: 8px;
    font-weight: bold;
    transition: background-color 0.3s;
  }

  label { display: block; padding: 4px 0; cursor: pointer; }
  fieldset { margin-bottom: 16px; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
</style>
```

**How `bind:group` differs from native radio behavior**: In plain HTML, you use the `name` attribute to group radio buttons. With Svelte's `bind:group`, the variable reference itself defines the group. All radio inputs bound to the same variable are in the same group. You do not need the `name` attribute (though adding it is fine for HTML form submission).

## bind:group for Checkbox Groups

When you have multiple checkboxes that should populate an array, use `bind:group` with an array variable:

```svelte
<script>
  let toppings = $state([]);
  let dietaryRestrictions = $state([]);

  const availableToppings = [
    'Pepperoni', 'Mushrooms', 'Olives', 'Onions',
    'Bell Peppers', 'Sausage', 'Pineapple', 'Bacon'
  ];

  let totalPrice = $derived(
    10 + toppings.length * 1.5
  );
</script>

<fieldset>
  <legend>Pizza Toppings ($1.50 each):</legend>

  {#each availableToppings as topping}
    <label>
      <input type="checkbox" bind:group={toppings} value={topping} />
      {topping}
    </label>
  {/each}
</fieldset>

<p>
  {#if toppings.length === 0}
    No toppings selected. Base pizza: $10.00
  {:else}
    Your toppings: {toppings.join(', ')}
    <br />
    Total: ${totalPrice.toFixed(2)}
  {/if}
</p>

<fieldset>
  <legend>Dietary Restrictions:</legend>
  {#each ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'] as restriction}
    <label>
      <input type="checkbox" bind:group={dietaryRestrictions} value={restriction} />
      {restriction}
    </label>
  {/each}
</fieldset>
```

Each checked box adds its value to the `toppings` array. Unchecking removes it. The order of items in the array matches the order they were checked, not the order they appear in the DOM.

## bind:value with Numbers

When binding to a number or range input, Svelte automatically converts the string to a number:

```svelte
<script>
  let age = $state(25);
  let rating = $state(50);
  let price = $state(9.99);

  let ageCategory = $derived(
    age < 13 ? 'Child' :
    age < 18 ? 'Teen' :
    age < 65 ? 'Adult' :
    'Senior'
  );
</script>

<label>
  Age: <input type="number" bind:value={age} min="0" max="120" />
  <span>({ageCategory})</span>
</label>

<label>
  Satisfaction: <input type="range" bind:value={rating} min="0" max="100" />
  <span>{rating}/100</span>
</label>

<label>
  Price: $<input type="number" bind:value={price} min="0" step="0.01" />
</label>

<p>typeof age: {typeof age} — typeof rating: {typeof rating}</p>
```

The `typeof` line proves that `age` and `rating` are actual numbers, not strings. This automatic conversion is critical — without it, you would need to manually parse every numeric input.

**Edge case**: If the user clears a number input (empty field), the bound variable becomes `undefined`, not `0` or `NaN`. Plan for this in your logic:

```svelte
<script>
  let quantity = $state(1);
  let total = $derived((quantity ?? 0) * 19.99);
</script>
```

## bind:files for File Inputs

File inputs use `bind:files` to get a `FileList` object:

```svelte
<script>
  let files = $state(null);

  let fileInfo = $derived(
    files?.[0]
      ? {
          name: files[0].name,
          size: (files[0].size / 1024).toFixed(1) + ' KB',
          type: files[0].type
        }
      : null
  );

  let preview = $derived(
    files?.[0]?.type.startsWith('image/')
      ? URL.createObjectURL(files[0])
      : null
  );
</script>

<input type="file" accept="image/*" bind:files />

{#if fileInfo}
  <div class="file-info">
    <p><strong>Name:</strong> {fileInfo.name}</p>
    <p><strong>Size:</strong> {fileInfo.size}</p>
    <p><strong>Type:</strong> {fileInfo.type}</p>
  </div>
{/if}

{#if preview}
  <img src={preview} alt="Preview" class="preview" />
{/if}

<style>
  .file-info {
    padding: 12px;
    background: #f8fafc;
    border-radius: 8px;
    margin-top: 12px;
  }
  .file-info p { margin: 4px 0; font-size: 0.9rem; }
  .preview { max-width: 300px; border-radius: 8px; margin-top: 12px; }
</style>
```

**Note**: `FileList` is read-only. You cannot programmatically set `files` to clear the input. To reset a file input, use `bind:this` to get the element reference and call `input.value = ''`.

## bind:this for Element References

Sometimes you need a direct reference to a DOM element — to focus it, measure it, or integrate with a third-party library. `bind:this` gives you the raw HTMLElement:

```svelte
<script>
  let inputElement = $state(null);
  let canvasElement = $state(null);

  function focusInput() {
    inputElement?.focus();
  }

  $effect(() => {
    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      ctx.fillStyle = '#3498db';
      ctx.fillRect(10, 10, 100, 100);
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(160, 60, 40, 0, Math.PI * 2);
      ctx.fill();
    }
  });
</script>

<div>
  <input bind:this={inputElement} placeholder="Click the button to focus me" />
  <button onclick={focusInput}>Focus Input</button>
</div>

<canvas bind:this={canvasElement} width="250" height="120"></canvas>
```

**Important**: The element reference is `null` during server-side rendering and before the component mounts. Always check for `null` before using it, or access it inside `$effect` which runs after mount.

**Common use cases for `bind:this`**:
- Focusing an input programmatically
- Measuring element dimensions (`getBoundingClientRect()`)
- Integrating with vanilla JS libraries (charts, maps, editors)
- Canvas drawing
- Scroll management (`scrollTo`, `scrollIntoView`)

```svelte
<script>
  let container = $state(null);

  function scrollToBottom() {
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }
</script>

<div class="chat" bind:this={container}>
  <!-- messages here -->
</div>
<button onclick={scrollToBottom}>Scroll to bottom</button>
```

## bind:open for Details Elements

The `<details>` element has a built-in open/close state. Bind to it with `bind:open`:

```svelte
<script>
  let faqOpen = $state(false);
</script>

<details bind:open={faqOpen}>
  <summary>What is Svelte?</summary>
  <p>Svelte is a compiler that turns declarative component code into efficient JavaScript.</p>
</details>

<p>FAQ is {faqOpen ? 'open' : 'closed'}</p>

<!-- Programmatic control -->
<button onclick={() => faqOpen = !faqOpen}>
  {faqOpen ? 'Close' : 'Open'} FAQ
</button>
```

This is useful for accordion-like interfaces where you need to track or control which sections are expanded.

## bind:contenteditable

For rich text editing, you can make any element editable and bind its HTML content:

```svelte
<script>
  let html = $state('<b>Bold</b> and <em>italic</em> text');
</script>

<div
  class="editor"
  contenteditable="true"
  bind:innerHTML={html}
></div>

<h4>Raw HTML:</h4>
<pre>{html}</pre>

<style>
  .editor {
    border: 2px solid #d1d5db;
    border-radius: 8px;
    padding: 16px;
    min-height: 100px;
    outline: none;
  }

  .editor:focus {
    border-color: #3498db;
  }

  pre {
    background: #f1f5f9;
    padding: 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
```

You can also bind `innerText` or `textContent` if you do not want HTML formatting.

**Warning**: `contenteditable` is powerful but tricky. Cursor position, selection handling, and cross-browser behavior are inconsistent. For production rich text editing, use a library like TipTap, ProseMirror, or Lexical. `bind:innerHTML` is fine for simple cases like editable labels or short annotations.

## Component Bindings with $bindable()

When you build reusable input components, you want the parent to be able to `bind:` to your component's props. The `$bindable()` rune opts a specific prop into two-way binding:

```svelte
<!-- TextInput.svelte -->
<script>
  let { value = $bindable(''), label = '', error = '', ...rest } = $props();
  const id = $props.id();
</script>

<div class="field">
  {#if label}
    <label for={id}>{label}</label>
  {/if}
  <input
    {id}
    bind:value
    class:has-error={!!error}
    aria-invalid={!!error}
    aria-describedby={error ? `${id}-error` : undefined}
    {...rest}
  />
  {#if error}
    <span id="{id}-error" class="error" role="alert">{error}</span>
  {/if}
</div>

<style>
  .field { margin-bottom: 16px; }
  label { display: block; font-weight: 600; margin-bottom: 4px; }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }
  input:focus { outline: 2px solid #3498db; outline-offset: 1px; }
  input.has-error { border-color: #ef4444; }
  .error { color: #ef4444; font-size: 0.85rem; margin-top: 4px; display: block; }
</style>
```

```svelte
<!-- App.svelte -->
<script>
  import TextInput from './TextInput.svelte';

  let username = $state('');
  let email = $state('');

  let usernameError = $derived(
    username.length > 0 && username.length < 3
      ? 'Username must be at least 3 characters'
      : ''
  );
</script>

<TextInput
  label="Username"
  bind:value={username}
  error={usernameError}
  placeholder="Choose a username"
  minlength={3}
/>

<TextInput
  label="Email"
  bind:value={email}
  type="email"
  placeholder="you@example.com"
/>

<p>Username: {username} | Email: {email}</p>
```

The `$bindable()` call tells Svelte this prop can be bound from the parent. Without it, `bind:value` on the component produces a compiler error.

**When to use `$bindable()`**: Form input wrappers, search components, slider components, color pickers — any component that encapsulates user input where the parent needs read/write access. For everything else (display components, layout components), stick with one-way props and callbacks.

## When NOT to Use Binding

Two-way binding is convenient but not always appropriate. Here are the cases where one-way data flow with callbacks is better:

**Complex transformations**: If the parent needs to transform the value before storing it (validation, formatting, debouncing), a callback gives you that control:

```svelte
<!-- Better than bind:value when you need transformation -->
<script>
  let rawInput = $state('');
  let sanitized = $state('');

  function handleInput(e) {
    rawInput = e.target.value;
    sanitized = rawInput.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  }
</script>

<input value={rawInput} oninput={handleInput} />
<p>Sanitized slug: {sanitized}</p>
```

**Multiple consumers**: If several parts of the state need to update when input changes, an explicit handler is clearer:

```svelte
<script>
  let query = $state('');
  let results = $state([]);
  let isSearching = $state(false);

  async function handleSearch(e) {
    query = e.target.value;
    if (query.length < 3) {
      results = [];
      return;
    }
    isSearching = true;
    results = await fetchResults(query);
    isSearching = false;
  }
</script>

<input value={query} oninput={handleSearch} />
```

**State machines**: If the component has discrete states (idle, loading, error, success), binding a value does not capture the full picture. Use explicit state management.

**Rule of thumb**: Use `bind:value` when you simply need the value. Use callbacks when you need to *react* to the change.

## Binding and Performance

Bindings fire on every keystroke (for text inputs) or every change (for selects, checkboxes). For most applications, this is perfectly fine — Svelte's reactivity is efficient enough that updating state on every keystroke is not a problem.

However, if your binding triggers an expensive derived computation or network request, debounce the reaction:

```svelte
<script>
  let rawQuery = $state('');
  let debouncedQuery = $state('');
  let debounceTimer;

  $effect(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = rawQuery;
    }, 300);

    return () => clearTimeout(debounceTimer);
  });

  // Use debouncedQuery for expensive operations
  let results = $derived(/* search with debouncedQuery */);
</script>

<input bind:value={rawQuery} placeholder="Search..." />
```

The input updates `rawQuery` instantly (keeping the UI responsive), but the expensive search only runs 300ms after the user stops typing.

## Complete Form Builder Example

Here is a production pattern — a form builder that uses multiple binding types:

```svelte
<script>
  // Personal info
  let firstName = $state('');
  let lastName = $state('');
  let email = $state('');
  let phone = $state('');

  // Preferences
  let theme = $state('light');
  let fontSize = $state(16);
  let language = $state('en');
  let notifications = $state(['email']);

  // Profile
  let bio = $state('');
  let website = $state('');
  let isPublic = $state(true);

  let fullName = $derived(`${firstName} ${lastName}`.trim());
  let bioLength = $derived(bio.length);

  function handleSubmit(event) {
    event.preventDefault();
    console.log({
      firstName, lastName, email, phone,
      theme, fontSize, language, notifications,
      bio, website, isPublic
    });
  }

  function resetForm() {
    firstName = '';
    lastName = '';
    email = '';
    phone = '';
    theme = 'light';
    fontSize = 16;
    language = 'en';
    notifications = ['email'];
    bio = '';
    website = '';
    isPublic = true;
  }
</script>

<form onsubmit={handleSubmit}>
  <fieldset>
    <legend>Personal Information</legend>

    <div class="row">
      <div class="field">
        <label for="fn">First Name</label>
        <input id="fn" type="text" bind:value={firstName} required />
      </div>
      <div class="field">
        <label for="ln">Last Name</label>
        <input id="ln" type="text" bind:value={lastName} required />
      </div>
    </div>

    <div class="field">
      <label for="em">Email</label>
      <input id="em" type="email" bind:value={email} required />
    </div>

    <div class="field">
      <label for="ph">Phone</label>
      <input id="ph" type="tel" bind:value={phone} />
    </div>
  </fieldset>

  <fieldset>
    <legend>Preferences</legend>

    <div class="field">
      <label>Theme:</label>
      <div class="radio-group">
        {#each ['light', 'dark', 'auto'] as t}
          <label>
            <input type="radio" bind:group={theme} value={t} />
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </label>
        {/each}
      </div>
    </div>

    <div class="field">
      <label for="fs">Font Size: {fontSize}px</label>
      <input id="fs" type="range" bind:value={fontSize} min="12" max="24" step="1" />
    </div>

    <div class="field">
      <label for="lang">Language</label>
      <select id="lang" bind:value={language}>
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="pt">Portuguese</option>
      </select>
    </div>

    <div class="field">
      <label>Notifications:</label>
      {#each ['email', 'sms', 'push', 'in-app'] as channel}
        <label class="check">
          <input type="checkbox" bind:group={notifications} value={channel} />
          {channel}
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Profile</legend>

    <div class="field">
      <label for="bio">Bio ({bioLength}/280)</label>
      <textarea id="bio" bind:value={bio} rows="4" maxlength="280"></textarea>
    </div>

    <div class="field">
      <label for="ws">Website</label>
      <input id="ws" type="url" bind:value={website} placeholder="https://" />
    </div>

    <label class="check">
      <input type="checkbox" bind:checked={isPublic} />
      Make profile public
    </label>
  </fieldset>

  <!-- Live preview -->
  <div class="preview" class:dark={theme === 'dark'} style:font-size="{fontSize}px">
    <h3>{fullName || 'Your Name'}</h3>
    <p>{bio || 'No bio yet'}</p>
    <p class="meta">
      {email || 'No email'} &bull;
      {language.toUpperCase()} &bull;
      {isPublic ? 'Public' : 'Private'} &bull;
      Notifications: {notifications.join(', ') || 'none'}
    </p>
  </div>

  <div class="actions">
    <button type="button" class="secondary" onclick={resetForm}>Reset</button>
    <button type="submit" class="primary">Save Profile</button>
  </div>
</form>

<style>
  form { max-width: 600px; }

  fieldset {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
  }

  legend { font-weight: 700; padding: 0 8px; }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .field { margin-bottom: 16px; }
  .field label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 0.9rem; }

  input[type="text"],
  input[type="email"],
  input[type="tel"],
  input[type="url"],
  select,
  textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  textarea { font-family: inherit; resize: vertical; }

  .radio-group {
    display: flex;
    gap: 16px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
  }

  .preview {
    padding: 20px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    margin-bottom: 16px;
    transition: all 0.3s;
  }

  .preview.dark {
    background: #1e293b;
    color: #e2e8f0;
    border-color: #334155;
  }

  .preview h3 { margin: 0 0 8px; }
  .preview p { margin: 4px 0; }
  .meta { font-size: 0.85rem; color: #64748b; }

  .actions { display: flex; gap: 12px; justify-content: flex-end; }

  .primary {
    padding: 12px 24px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }

  .secondary {
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

This example demonstrates every binding type in one cohesive form:
- `bind:value` for text, email, tel, url, textarea, select, range, and number inputs
- `bind:checked` for the public profile toggle
- `bind:group` for radio buttons (theme) and checkbox groups (notifications)
- `$derived` for computed values (full name, character count)
- A live preview that reflects all bindings in real time
- A reset function that programmatically restores all values to defaults

## Try It

Build a "Theme Customizer" with these bindings:

1. A text input bound to `siteName` (with a live preview as a page title)
2. A color picker (`<input type="color">`) bound to `primaryColor`
3. A second color picker bound to `backgroundColor`
4. Radio buttons bound to `fontSize` (small/medium/large)
5. A range slider bound to `borderRadius` (0-30px)
6. Checkboxes bound to `features` array (sidebar, search bar, dark mode, footer)
7. A `<details>` element with `bind:open` showing advanced settings
8. A live preview section that uses all the customized values as inline styles

The preview should update instantly as any value changes.

## Key Takeaways

- `bind:value` creates two-way binding between an input and a variable — equivalent to setting the value + listening for input events
- `bind:checked` binds a checkbox to a boolean — do not confuse with `bind:value`
- `bind:group` binds radio buttons (single value) or checkboxes (array) to a shared variable
- `bind:files` gives you a `FileList` from file inputs
- `bind:this` provides a raw DOM element reference — use for focus management, measurements, and library integration
- `bind:open` syncs the open/close state of `<details>` elements
- `bind:innerHTML` and `bind:textContent` work with `contenteditable` elements
- Number and range inputs automatically convert to JavaScript numbers
- Use `$bindable()` in component props to allow parent components to use `bind:` on them
- Prefer one-way data flow (value + callback) over binding when you need to transform, debounce, or orchestrate complex state changes
- Debounce expensive reactions to bindings to maintain performance
