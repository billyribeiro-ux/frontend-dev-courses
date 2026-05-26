# Dynamic Text & Template Expressions

You already know that curly braces `{}` display a variable in HTML. But curly braces can do much more than just show a single value — you can put **any JavaScript expression** inside them. Math, string operations, function calls, ternary logic, method chains — all of it works right inside your markup.

This technique is called **interpolation**, and once you truly understand it, you will see that Svelte templates are not "HTML with sprinkles of JS" — they are a full expression language embedded in markup. Mastering expressions, attribute bindings, directives, and spread patterns is what separates a beginner who copies snippets from a developer who thinks in Svelte.

## The Mental Model: Templates Are Expression Slots

Every `{}` in Svelte markup is an **expression slot**. The compiler evaluates whatever JavaScript expression is inside and renders the result into the DOM. The key word is *expression* — something that produces a value. Statements like `if`, `for`, `let x = 5` do not work inside `{}` because they do not produce values.

```svelte
<script>
  let price = 29.99;
  let quantity = 3;
  let firstName = "Alex";
  let lastName = "Johnson";
</script>

<!-- Simple variable reference -->
<p>Price: {price}</p>

<!-- Arithmetic expression -->
<p>Total: ${price * quantity}</p>

<!-- String concatenation -->
<p>Full name: {firstName + " " + lastName}</p>

<!-- Method call — any method that returns a value works -->
<p>Uppercase: {firstName.toUpperCase()}</p>

<!-- Ternary (conditional) expression -->
<p>Status: {quantity > 0 ? "In Stock" : "Sold Out"}</p>

<!-- Chained methods -->
<p>Initials: {firstName.charAt(0)}.{lastName.charAt(0)}.</p>

<!-- Logical OR for defaults -->
<p>Display: {firstName || "Anonymous"}</p>

<!-- Comma operator (evaluates both, returns last) — avoid in templates, shown for completeness -->
<!-- <p>{(console.log('rendered'), firstName)}</p> -->
```

The rule is simple but worth stating precisely: if it is a valid JavaScript expression that produces a value, you can put it inside `{}`. If the compiler rejects it, you have probably written a statement instead of an expression.

### What Counts as an Expression?

This distinction trips up beginners constantly, so let's be explicit:

| Works (expressions) | Fails (statements) |
|---|---|
| `{count + 1}` | `{let x = 5}` |
| `{isActive ? "yes" : "no"}` | `{if (isActive) "yes"}` |
| `{items.filter(x => x.active)}` | `{for (let i = 0; i < 10; i++)}` |
| `{(() => { let x = 5; return x * 2; })()}` | `{return 42}` |

The last "works" example — an immediately-invoked function expression (IIFE) — is technically valid but should never appear in production Svelte code. If you need multi-step logic in a template, use `$derived` or `{@const}` (covered below).

## Template Literals in Expressions

**Template literals** are JavaScript's built-in string interpolation syntax. They use backticks and `${}` for embedded expressions. You can nest them inside Svelte's `{}` expression slots:

```svelte
<script>
  let name = "Alex";
  let age = 25;
  let city = "Portland";
</script>

<!-- Template literal inside Svelte expression slot -->
<p>{`Hello, ${name}! You are ${age} years old.`}</p>

<!-- Multi-part template literal -->
<p>{`${name} (${age}) — ${city}`}</p>

<!-- Template literal with expression inside -->
<p>{`Next year you will be ${age + 1}`}</p>
```

Note the double interpolation happening here: Svelte's `{}` evaluates the template literal, and the template literal's `${}` evaluates the embedded expressions. This is not nesting bugs — it is two layers working together naturally.

**When to use template literals vs Svelte expressions:**

For simple displays, Svelte expressions are cleaner — `<p>{name}, {age}</p>` reads better than `<p>{`${name}, ${age}`}</p>`. Use template literals when you need to build a single string value, especially in attributes or when passing strings to functions.

## Computed Values in the Script Block

When an expression gets complex or repeats across your template, extract it into a variable. For static computations, a plain `const` or `let` works. For reactive computations (values that should update when state changes), use `$derived()`:

```svelte
<script>
  let hours = $state(8);
  let rate = $state(25);
  let overtime = $state(0);

  // Static computation — fine for values that never change
  const companyName = "Acme Corp";
  const taxRate = 0.22;

  // Reactive computations — update when hours/rate/overtime change
  let basePay = $derived(hours * rate);
  let overtimePay = $derived(overtime * rate * 1.5);
  let grossPay = $derived(basePay + overtimePay);
  let taxAmount = $derived(grossPay * taxRate);
  let netPay = $derived(grossPay - taxAmount);
</script>

<h2>Pay Calculator — {companyName}</h2>
<p>Base ({hours}h x ${rate}/hr): ${basePay.toFixed(2)}</p>
<p>Overtime ({overtime}h x ${rate * 1.5}/hr): ${overtimePay.toFixed(2)}</p>
<p>Gross: ${grossPay.toFixed(2)}</p>
<p>Tax ({taxRate * 100}%): -${taxAmount.toFixed(2)}</p>
<hr />
<p><strong>Net Pay: ${netPay.toFixed(2)}</strong></p>
```

Compare the markup readability to inlining everything: `${(hours * rate + overtime * rate * 1.5) * (1 - 0.22)}`. Derived values are not just about reactivity — they are about keeping your template readable and your logic testable.

## Expressions in Attributes

Curly braces work inside HTML attributes, not just text content. This is how you make attributes dynamic:

```svelte
<script>
  let imageUrl = "https://picsum.photos/300/200";
  let altText = "A random landscape photo";
  let isLarge = true;
  let linkUrl = "https://svelte.dev";
  let tabIndex = 0;
</script>

<!-- Dynamic attribute values -->
<img src={imageUrl} alt={altText} />

<!-- Expression in attribute — ternary for conditional class -->
<p class={isLarge ? "text-large" : "text-small"}>
  Dynamic sizing!
</p>

<!-- Dynamic href -->
<a href={linkUrl}>Visit Svelte</a>

<!-- Dynamic numeric attribute -->
<div tabindex={tabIndex}>Focusable</div>

<!-- Template literal in an attribute -->
<img src={`https://picsum.photos/seed/${altText}/300/200`} alt={altText} />

<style>
  .text-large { font-size: 2rem; }
  .text-small { font-size: 0.8rem; }
</style>
```

When the entire attribute value is a single expression, you drop the quotes: write `src={imageUrl}`, not `src="{imageUrl}"`. Svelte allows both forms, but the unquoted version is idiomatic and cleaner.

### Shorthand Attribute Binding

When an attribute name matches a variable name, Svelte provides a shorthand:

```svelte
<script>
  let src = "https://picsum.photos/300/200";
  let alt = "Random photo";
  let href = "https://svelte.dev";
  let id = "main-content";
</script>

<!-- Shorthand — the attribute name IS the variable name -->
<img {src} {alt} />
<a {href}>Visit Svelte</a>
<div {id}>Content here</div>

<!-- The above is exactly equivalent to: -->
<img src={src} alt={alt} />
<a href={href}>Visit Svelte</a>
<div id={id}>Content here</div>
```

This shorthand is not just syntactic sugar — it is a signal to other developers that the variable name intentionally matches the attribute. Use it whenever the naming aligns naturally. Avoid renaming variables just to use the shorthand — clarity beats brevity.

## The `class:` Directive

Conditionally adding CSS classes is one of the most common operations in UI development. Svelte provides a dedicated directive for this:

```svelte
<script>
  let isActive = $state(false);
  let isDisabled = $state(false);
  let isLoading = $state(false);
  let hasError = $state(false);
  let size = $state("medium");
</script>

<!-- class:name={condition} adds class when condition is truthy -->
<button
  class="btn"
  class:active={isActive}
  class:disabled={isDisabled}
  class:loading={isLoading}
  class:error={hasError}
  onclick={() => isActive = !isActive}
>
  {isActive ? "Active" : "Inactive"}
</button>

<!-- Shorthand: when class name matches variable name -->
<!-- class:isActive is equivalent to class:isActive={isActive} -->

<!-- Multiple classes on one element — all evaluate independently -->
<div
  class="card"
  class:highlighted={isActive}
  class:faded={isDisabled}
  class:shake={hasError}
>
  Card content
</div>

<style>
  .btn { padding: 8px 16px; border: 2px solid #3498db; border-radius: 4px; cursor: pointer; }
  .btn.active { background: #3498db; color: white; }
  .btn.disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.loading { opacity: 0.7; cursor: wait; }
  .btn.error { border-color: #e74c3c; }
  .card { padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  .highlighted { border-color: #f39c12; background: #fef9e7; }
  .faded { opacity: 0.4; }
</style>
```

The `class:` directive has a **shorthand** form: if the class name matches the variable name, you can omit the expression:

```svelte
<script>
  let active = $state(false);
  let disabled = $state(false);
</script>

<!-- Shorthand: class:active is the same as class:active={active} -->
<button class:active class:disabled>Click me</button>
```

### `class:` vs Ternary in class Attribute

Both approaches work. Here is when to use which:

```svelte
<!-- class: directive — best for toggling a single class on/off -->
<div class:highlighted={isActive}>...</div>

<!-- Ternary in class attribute — best for switching between two classes -->
<div class={isActive ? "theme-dark" : "theme-light"}>...</div>

<!-- Template literal — best for composing multiple dynamic classes -->
<div class={`card ${size} ${isActive ? "active" : ""}`}>...</div>
```

The `class:` directive is preferred for boolean toggles because it is declarative and composes well — you can stack multiple `class:` directives on one element without building string concatenation logic.

## The `style:` Directive

Just as `class:` targets CSS classes, the `style:` directive targets individual CSS properties:

```svelte
<script>
  let color = $state("#3498db");
  let fontSize = $state(16);
  let opacity = $state(1);
  let bgColor = $state("#ffffff");
  let rotation = $state(0);
</script>

<!-- style:property={value} sets a single CSS property -->
<div
  style:color={color}
  style:font-size="{fontSize}px"
  style:opacity={opacity}
  style:background-color={bgColor}
  style:transform="rotate({rotation}deg)"
>
  Styled dynamically!
</div>

<!-- With !important (rarely needed, but supported) -->
<div style:color={color} style:--custom-var="10px">
  Custom properties work too
</div>
```

### `style:` vs inline `style` Attribute

```svelte
<script>
  let width = $state(50);
  let height = $state(100);
  let bg = $state("#e74c3c");
</script>

<!-- style attribute — all-or-nothing, must build the entire string -->
<div style="width: {width}px; height: {height}px; background: {bg};">
  Using style attribute
</div>

<!-- style: directives — granular, each property independent -->
<div
  style:width="{width}px"
  style:height="{height}px"
  style:background={bg}
>
  Using style directives
</div>
```

The `style:` directive is preferred in components because:
1. Each property updates independently — if only `width` changes, Svelte only updates that one property, not the whole style string.
2. It composes well with `style` attributes — you can have both a static `style` attribute and dynamic `style:` directives on the same element.
3. It works cleanly with CSS custom properties (`style:--my-var={value}`).

## Spreading Attributes with `{...props}`

When you receive an object of attributes — common in wrapper components — you can spread them onto an element:

```svelte
<script>
  // Imagine these come from a parent component via props
  let buttonAttrs = {
    type: "submit",
    disabled: false,
    "aria-label": "Submit form",
    class: "btn primary"
  };

  let inputAttrs = $state({
    type: "email",
    placeholder: "you@example.com",
    required: true,
    "aria-describedby": "email-help"
  });
</script>

<!-- Spread all attributes from the object onto the element -->
<button {...buttonAttrs}>Submit</button>

<!-- Spread + override — explicit attributes win over spread -->
<button {...buttonAttrs} disabled={true}>Disabled Submit</button>

<!-- Spread on input -->
<input {...inputAttrs} />
```

**Attribute precedence rule:** When you spread and also set an attribute explicitly, the last one wins. This follows the same left-to-right evaluation as JavaScript object spread:

```svelte
<!-- disabled from the spread (false) is overridden by the explicit disabled={true} -->
<button {...buttonAttrs} disabled={true}>Disabled</button>

<!-- Here the spread comes last, so its disabled value wins -->
<button disabled={true} {...buttonAttrs}>Not Disabled</button>
```

This precedence rule is critical for building wrapper components that let parents override defaults.

## The `{@const}` Tag for Template-Local Computed Values

Sometimes you need a computed value inside a template block (like inside an `{#each}` or `{#if}`) without hoisting it to the script. The `{@const}` tag handles this:

```svelte
<script>
  let products = $state([
    { name: "Widget", price: 9.99, quantity: 3 },
    { name: "Gadget", price: 24.99, quantity: 1 },
    { name: "Doohickey", price: 4.99, quantity: 10 }
  ]);
</script>

<ul>
  {#each products as product}
    {@const lineTotal = product.price * product.quantity}
    {@const isExpensive = lineTotal > 20}
    <li class:expensive={isExpensive}>
      {product.name}: {product.quantity} x ${product.price.toFixed(2)}
      = <strong>${lineTotal.toFixed(2)}</strong>
      {#if isExpensive}
        <span class="tag">Big order</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .expensive { color: #e74c3c; font-weight: bold; }
  .tag { font-size: 0.75rem; background: #fdebd0; padding: 2px 6px; border-radius: 4px; }
</style>
```

`{@const}` is evaluated once per block iteration. It creates a block-scoped constant — you cannot reassign it. Think of it as a `const` declaration that lives in template scope rather than script scope.

**When to use `{@const}` vs `$derived`:**
- Use `$derived` when the value is used in the script block or in multiple template locations.
- Use `{@const}` when the value is local to one template block (especially inside `{#each}`) and would clutter the script.

## Nullish and Falsy Value Handling

Understanding how Svelte renders different JavaScript values is essential for avoiding surprises:

```svelte
<script>
  let name = $state("Alex");
  let count = $state(0);
  let empty = $state("");
  let nothing = $state(null);
  let notDefined = $state(undefined);
  let isFalse = $state(false);
  let list = $state([]);
</script>

<!-- What Svelte renders for each value: -->
<p>String: "{name}"</p>          <!-- "Alex" -->
<p>Zero: "{count}"</p>            <!-- "0" — renders the character "0" -->
<p>Empty string: "{empty}"</p>    <!-- "" — renders nothing visible -->
<p>Null: "{nothing}"</p>          <!-- "" — renders nothing visible -->
<p>Undefined: "{notDefined}"</p>  <!-- "" — renders nothing visible -->
<p>False: "{isFalse}"</p>         <!-- "false" — renders the string "false"! -->
<p>Array: "{list}"</p>            <!-- "" — empty array becomes empty string -->
```

The critical gotchas:

1. **`0` renders as `"0"`**, not as nothing. If you use `{count && "has items"}`, when count is 0 you get `"0"` in your markup, not nothing. Use `{count > 0 ? "has items" : ""}` or `{count ? "has items" : ""}` carefully.

2. **`false` renders as `"false"`** — the string. This is a common source of bugs: `{isActive && "Active"}` when `isActive` is false renders `"false"`, not nothing. Always use a ternary or an `{#if}` block for conditional text.

3. **`null` and `undefined` render as empty strings** — they produce no visible output. This is usually what you want for optional values.

```svelte
<script>
  let items = $state(0);
</script>

<!-- BUG: renders "0" when items is 0 -->
<p>{items && `${items} items in cart`}</p>

<!-- CORRECT: explicit ternary -->
<p>{items > 0 ? `${items} items in cart` : "Cart is empty"}</p>

<!-- CORRECT: use {#if} for conditional rendering -->
{#if items > 0}
  <p>{items} items in cart</p>
{:else}
  <p>Cart is empty</p>
{/if}
```

## Formatting Numbers and Dates

Expressions in curly braces let you format data for display. Here are the patterns you will use constantly:

```svelte
<script>
  let price = 1499.5;
  let percentage = 0.8567;
  let bigNumber = 1234567.89;
  let today = new Date();
  let isoDate = "2025-03-15T10:30:00Z";
</script>

<!-- Fixed decimal places -->
<p>Price: ${price.toFixed(2)}</p>

<!-- Percentage -->
<p>Score: {(percentage * 100).toFixed(1)}%</p>

<!-- Locale-aware number formatting -->
<p>Revenue: {bigNumber.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>

<!-- Date formatting -->
<p>Today: {today.toLocaleDateString()}</p>
<p>Full: {today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

<!-- Parsing and formatting ISO dates -->
<p>Event: {new Date(isoDate).toLocaleDateString()}</p>

<!-- Relative time (simple) -->
<p>Days this year: {Math.floor((today - new Date(today.getFullYear(), 0, 1)) / 86400000)}</p>
```

**Production tip:** For complex formatting, create helper functions rather than inlining:

```svelte
<script>
  let price = $state(1499.5);
  let date = $state(new Date());

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  }

  function formatDate(d) {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
  }
</script>

<p>Price: {formatCurrency(price)}</p>
<p>Date: {formatDate(date)}</p>
```

Helper functions are testable, reusable, and keep your template clean. Move them to a shared utility module when multiple components need them.

## Boolean Attributes

HTML has "boolean attributes" — attributes that are present or absent, with no value (like `disabled`, `required`, `checked`, `readonly`). Svelte handles them naturally:

```svelte
<script>
  let isDisabled = $state(false);
  let isRequired = $state(true);
  let isReadonly = $state(false);
</script>

<!-- Boolean attributes: present when true, absent when false -->
<button disabled={isDisabled}>Click me</button>
<input required={isRequired} />
<input readonly={isReadonly} value="Can't edit this" />

<!-- Shorthand when variable name matches attribute -->
<input {required} />
```

When the expression evaluates to `false`, `null`, or `undefined`, Svelte removes the attribute entirely from the DOM — it does not render `disabled="false"`. This matches the HTML spec where boolean attributes mean "present = true, absent = false".

## Complete Example: Interactive Dashboard Widget

Let's put everything together — expressions, attribute bindings, `class:` and `style:` directives, `{@const}`, spreading, and formatting — in a single production-quality component:

```svelte
<script>
  let metricName = $state("Revenue");
  let currentValue = $state(48750);
  let previousValue = $state(42300);
  let target = $state(55000);
  let currency = $state("USD");
  let showDetails = $state(false);
  let colorTheme = $state("blue");

  let change = $derived(currentValue - previousValue);
  let changePercent = $derived(
    previousValue !== 0 ? ((change / previousValue) * 100) : 0
  );
  let progressPercent = $derived(
    target > 0 ? Math.min((currentValue / target) * 100, 100) : 0
  );
  let isPositive = $derived(change >= 0);
  let isOnTrack = $derived(currentValue >= target * 0.8);

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  const themes = {
    blue: { primary: "#3498db", bg: "#ebf5fb" },
    green: { primary: "#27ae60", bg: "#eafaf1" },
    purple: { primary: "#8e44ad", bg: "#f4ecf7" }
  };

  let themeColors = $derived(themes[colorTheme] ?? themes.blue);

  let badgeProps = $derived({
    class: "badge",
    "aria-label": `Change: ${changePercent.toFixed(1)}%`
  });
</script>

<div
  class="widget"
  class:on-track={isOnTrack}
  class:behind={!isOnTrack}
  style:border-color={themeColors.primary}
  style:--accent={themeColors.primary}
  style:--accent-bg={themeColors.bg}
>
  <div class="header">
    <h3>{metricName}</h3>
    <div class="theme-selector">
      {#each Object.keys(themes) as theme}
        <button
          class="theme-dot"
          class:selected={colorTheme === theme}
          style:background={themes[theme].primary}
          onclick={() => colorTheme = theme}
          aria-label={`${theme} theme`}
        ></button>
      {/each}
    </div>
  </div>

  <p class="value">{formatCurrency(currentValue)}</p>

  <div class="change" class:positive={isPositive} class:negative={!isPositive}>
    <span {...badgeProps}>
      {isPositive ? "+" : ""}{changePercent.toFixed(1)}%
    </span>
    <span class="change-amount">
      ({isPositive ? "+" : ""}{formatCurrency(change)} vs prior)
    </span>
  </div>

  <div class="progress-section">
    <div class="progress-labels">
      <span>Progress to target</span>
      <span>{progressPercent.toFixed(0)}%</span>
    </div>
    <div class="progress-bar">
      <div
        class="progress-fill"
        style:width="{progressPercent}%"
        style:background={themeColors.primary}
      ></div>
    </div>
    <p class="target-label">Target: {formatCurrency(target)}</p>
  </div>

  <button class="toggle" onclick={() => showDetails = !showDetails}>
    {showDetails ? "Hide" : "Show"} Details {showDetails ? "▲" : "▼"}
  </button>

  {#if showDetails}
    <div class="details" style:background={themeColors.bg}>
      {@const gap = target - currentValue}
      {@const dailyNeeded = gap > 0 ? gap / 30 : 0}
      <p>Current: {formatCurrency(currentValue)}</p>
      <p>Previous: {formatCurrency(previousValue)}</p>
      <p>Target: {formatCurrency(target)}</p>
      {#if gap > 0}
        <p>Remaining: {formatCurrency(gap)}</p>
        <p>Daily needed: {formatCurrency(dailyNeeded)}/day for 30 days</p>
      {:else}
        <p class="success">Target exceeded by {formatCurrency(-gap)}!</p>
      {/if}
    </div>
  {/if}
</div>

<div class="controls">
  <label>
    Value:
    <input type="range" bind:value={currentValue} min="0" max="100000" step="500" />
    {formatCurrency(currentValue)}
  </label>
  <label>
    Target:
    <input type="range" bind:value={target} min="10000" max="100000" step="1000" />
    {formatCurrency(target)}
  </label>
</div>

<style>
  .widget {
    max-width: 400px;
    padding: 20px;
    border: 2px solid;
    border-radius: 12px;
    font-family: system-ui, sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header h3 { margin: 0; color: #333; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; }

  .theme-selector { display: flex; gap: 6px; }

  .theme-dot {
    width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent;
    cursor: pointer; padding: 0;
  }

  .theme-dot.selected { border-color: #333; }

  .value { font-size: 2rem; font-weight: 700; margin: 8px 0 4px; color: var(--accent); }

  .change { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .badge { padding: 2px 8px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; }
  .positive .badge { background: #d4edda; color: #155724; }
  .negative .badge { background: #f8d7da; color: #721c24; }
  .change-amount { font-size: 0.8rem; color: #888; }

  .progress-section { margin-bottom: 16px; }
  .progress-labels { display: flex; justify-content: space-between; font-size: 0.8rem; color: #666; margin-bottom: 4px; }
  .progress-bar { height: 8px; background: #ecf0f1; border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
  .target-label { font-size: 0.75rem; color: #999; margin-top: 4px; }

  .toggle { width: 100%; padding: 8px; background: none; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; color: #666; }
  .toggle:hover { background: #f9f9f9; }

  .details { margin-top: 12px; padding: 12px; border-radius: 8px; font-size: 0.9rem; }
  .details p { margin: 4px 0; }
  .success { color: #27ae60; font-weight: bold; }

  .controls { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; max-width: 400px; }
  .controls label { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
  .controls input[type="range"] { flex: 1; }
</style>
```

Study this example carefully. Notice how:

- **`$derived`** computes all values from `currentValue`, `previousValue`, and `target`. The template never does raw math — it calls `formatCurrency()` or reads derived values.
- **`class:` directives** toggle visual states (`on-track`, `positive`, `negative`, `selected`) without string manipulation.
- **`style:` directives** set individual CSS properties (`border-color`, `width`, `background`) while CSS custom properties (`--accent`, `--accent-bg`) theme the entire widget.
- **`{@const}`** computes `gap` and `dailyNeeded` inside the details block — values that only matter when details are visible.
- **`{...badgeProps}`** spreads a derived attribute object onto the badge span.
- **Formatting** is extracted into `formatCurrency()` — called many times but defined once.

## Try It Yourself

Build a "Fitness Tracker" dashboard component that includes:

1. **State variables** for `steps` (number), `caloriesBurned` (number), `goalSteps` (number, default 10000), and `userName` (string).
2. **Derived values** for `progressPercent`, `remainingSteps`, and `paceRequired` (remaining steps divided by hours left assuming 16 waking hours).
3. **`style:` directives** on a progress bar that dynamically sets width and background color (green when above 75%, yellow 50-75%, red below 50%).
4. **`class:` directives** to highlight the summary card differently when the goal is met.
5. **`{@const}`** inside the display to compute calories per step for the details section.
6. **`formatNumber()`** helper function for locale-aware number formatting.
7. **Sliders** to adjust steps and goal dynamically so you can see all the interpolation update live.

## Key Takeaways

- **Any JavaScript expression** can go inside `{}` in Svelte markup — but only expressions, not statements
- **Template literals** (backticks + `${}`) work inside Svelte expressions for complex string building
- **Shorthand attributes** (`{name}` instead of `name={name}`) reduce boilerplate when names align
- **`class:name={condition}`** toggles CSS classes — cleaner than ternary string building, and each class updates independently
- **`style:property={value}`** sets individual CSS properties — more granular and performant than a full `style` string
- **`{...props}`** spreads an object of attributes — essential for wrapper components; last-write-wins precedence
- **`{@const}`** creates block-scoped computed values in templates — use it inside `{#each}` and `{#if}` blocks
- **Nullish values** (`null`, `undefined`) render as empty strings; `false` renders as the string `"false"`; `0` renders as `"0"` — use ternaries or `{#if}` blocks for conditional text, not `&&`
- **Extract formatting** into helper functions — they are testable, reusable, and keep your template readable
- **Boolean attributes** (`disabled`, `required`) are removed from the DOM when the expression is falsy — matching the HTML spec
