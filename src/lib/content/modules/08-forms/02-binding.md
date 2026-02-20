# Two-Way Binding

In the last lesson, you created form elements, but you had no way to read what the user typed. You could listen for events with `oninput`, but Svelte offers something much more elegant: **two-way binding**. With the `bind:` directive, a variable and a form input stay perfectly in sync — change the variable and the input updates; type in the input and the variable updates.

This is one of Svelte's most loved features. It eliminates the boilerplate of manually reading input values and updating state, letting you focus on building your UI.

## bind:value for Text Inputs

The `bind:value` directive connects an input's value to a variable:

```svelte
<script>
  let name = $state("");
</script>

<label for="name">Your name:</label>
<input id="name" type="text" bind:value={name} />

<p>Hello, {name || "stranger"}!</p>
```

As the user types, `name` updates instantly. The paragraph below the input shows the value in real time. No `oninput` handler needed.

## bind:value with Textarea and Select

It works the same way with textareas and select dropdowns:

```svelte
<script>
  let message = $state("");
  let priority = $state("medium");
</script>

<label for="msg">Message:</label>
<textarea id="msg" bind:value={message} rows="4"></textarea>

<label for="pri">Priority:</label>
<select id="pri" bind:value={priority}>
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>
</select>

<div class="preview">
  <p><strong>Priority:</strong> {priority}</p>
  <p><strong>Message:</strong> {message || "(empty)"}</p>
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

  <label>
    <input type="checkbox" bind:checked={darkMode} />
    Dark Mode
  </label>

  <label>
    <input type="checkbox" bind:checked={showNotifications} />
    Show Notifications
  </label>

  <label>
    <input type="checkbox" bind:checked={agreeToTerms} />
    I agree to the terms
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
  }

  .settings.dark {
    background: #2c3e50;
    color: #ecf0f1;
    border-color: #34495e;
  }

  label {
    display: block;
    padding: 8px 0;
    cursor: pointer;
  }
</style>
```

Toggling the "Dark Mode" checkbox instantly applies the dark theme. That is `bind:checked` plus `class:dark` working together.

## bind:group for Radio Buttons

Radio buttons that share a group bind to the **same variable**. The variable holds whichever value is selected:

```svelte
<script>
  let selectedColor = $state("blue");
</script>

<fieldset>
  <legend>Choose a color:</legend>

  <label>
    <input type="radio" bind:group={selectedColor} value="red" />
    Red
  </label>

  <label>
    <input type="radio" bind:group={selectedColor} value="green" />
    Green
  </label>

  <label>
    <input type="radio" bind:group={selectedColor} value="blue" />
    Blue
  </label>
</fieldset>

<div class="preview" style="background-color: {selectedColor};">
  Selected: {selectedColor}
</div>

<style>
  .preview {
    margin-top: 16px;
    padding: 20px;
    color: white;
    text-align: center;
    border-radius: 8px;
    font-weight: bold;
  }

  label { display: block; padding: 4px 0; cursor: pointer; }
</style>
```

## bind:group for Checkbox Groups

When you have multiple checkboxes that should populate an array, use `bind:group` with an array variable:

```svelte
<script>
  let toppings = $state([]);
</script>

<fieldset>
  <legend>Pizza Toppings:</legend>

  <label>
    <input type="checkbox" bind:group={toppings} value="pepperoni" />
    Pepperoni
  </label>
  <label>
    <input type="checkbox" bind:group={toppings} value="mushrooms" />
    Mushrooms
  </label>
  <label>
    <input type="checkbox" bind:group={toppings} value="olives" />
    Olives
  </label>
  <label>
    <input type="checkbox" bind:group={toppings} value="onions" />
    Onions
  </label>
</fieldset>

<p>
  {#if toppings.length === 0}
    No toppings selected.
  {:else}
    Your toppings: {toppings.join(", ")}
  {/if}
</p>
```

Each checked box adds its value to the `toppings` array. Unchecking removes it.

## bind:value with Numbers

When binding to a number input, Svelte automatically converts the string to a number:

```svelte
<script>
  let age = $state(25);
  let rating = $state(50);
</script>

<label>
  Age: <input type="number" bind:value={age} min="0" max="120" />
</label>

<label>
  Rating: <input type="range" bind:value={rating} min="0" max="100" />
  {rating}/100
</label>
```

## $bindable() for Component Props

When you build a reusable input component, you can make a prop bindable using `$bindable()`. This lets the parent use `bind:` on your component's props:

```svelte
<!-- TextInput.svelte -->
<script>
  let { value = $bindable(""), label = "" } = $props();
</script>

<label>
  {label}
  <input type="text" bind:value={value} />
</label>

<style>
  label { display: block; font-weight: bold; margin-bottom: 12px; }
  input { display: block; padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 100%; margin-top: 4px; }
</style>
```

```svelte
<!-- App.svelte -->
<script>
  import TextInput from './TextInput.svelte';
  let username = $state("");
</script>

<TextInput label="Username" bind:value={username} />
<p>Username: {username}</p>
```

The `$bindable()` rune tells Svelte this prop can be bound from the parent.

## Try It

Build a "Theme Customizer" component with:
- A text input bound to a `siteName` variable
- A color picker input bound to a `primaryColor` variable
- Radio buttons bound to `fontSize` (small, medium, large)
- A checkbox bound to `showSidebar`
- A live preview section that reflects all the settings in real time

## Key Takeaways

- `bind:value` creates two-way binding between an input and a variable
- `bind:checked` binds a checkbox to a boolean
- `bind:group` binds radio buttons (single value) or checkboxes (array) to a shared variable
- Number inputs automatically convert to JavaScript numbers with `bind:value`
- Use `$bindable()` in component props to allow parent components to use `bind:` on them
- Two-way binding eliminates manual event handling and keeps your code concise
