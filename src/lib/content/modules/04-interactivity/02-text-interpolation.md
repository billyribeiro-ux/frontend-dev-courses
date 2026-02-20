# Dynamic Text

You already know that curly braces `{}` display a variable in HTML. But curly braces can do much more than just show a single value — you can put **any JavaScript expression** inside them. This means math, string joining, function calls, and conditional logic all work right in your markup.

This technique is called **interpolation**, and it is one of the most powerful features of Svelte. Once you master it, you can build dynamic interfaces without writing a ton of extra code.

## Curly Brace Expressions

Anything inside `{}` in your Svelte markup is evaluated as JavaScript:

```svelte
<script>
  let price = 29.99;
  let quantity = 3;
  let firstName = "Alex";
  let lastName = "Johnson";
</script>

<!-- Simple variable -->
<p>Price: {price}</p>

<!-- Math expression -->
<p>Total: ${price * quantity}</p>

<!-- String concatenation -->
<p>Full name: {firstName + " " + lastName}</p>

<!-- Method call -->
<p>Uppercase: {firstName.toUpperCase()}</p>

<!-- Ternary expression -->
<p>Status: {quantity > 0 ? "In Stock" : "Sold Out"}</p>
```

The rule is simple: if it is a valid JavaScript expression that produces a value, you can put it inside `{}`.

## Template Literals

**Template literals** are a modern JavaScript feature for building strings. Instead of joining strings with `+`, you wrap text in backticks and use `${}` for variables:

```svelte
<script>
  let name = "Alex";
  let age = 25;
  let city = "Portland";

  // Using + (old way)
  let greeting1 = "Hello, " + name + "! You are " + age + " years old.";

  // Using template literals (modern way)
  let greeting2 = `Hello, ${name}! You are ${age} years old.`;
</script>

<p>{greeting1}</p>
<p>{greeting2}</p>
<p>{`Welcome to ${city}, ${name}!`}</p>
```

Template literals use backticks (`` ` ``), not regular quotes. The `${}` inside backticks works like `{}` in Svelte markup — it evaluates JavaScript expressions.

## Computed Values

You can create variables that are calculated from other variables. This keeps your markup clean:

```svelte
<script>
  let hours = $state(8);
  let rate = $state(25);

  let dailyPay = $state(0);

  // We'll learn a better way to do this with $derived() soon!
</script>

<h2>Pay Calculator</h2>
<p>Hours: {hours}</p>
<p>Rate: ${rate}/hr</p>
<p>Daily Pay: ${hours * rate}</p>
<p>Weekly Pay: ${hours * rate * 5}</p>
<p>Monthly Pay: ${hours * rate * 5 * 4}</p>
```

## Expressions in Attributes

Curly braces also work inside HTML attributes — not just text content:

```svelte
<script>
  let imageUrl = "https://picsum.photos/300/200";
  let altText = "A random landscape photo";
  let isLarge = true;
  let linkUrl = "https://svelte.dev";
</script>

<!-- Dynamic attribute values -->
<img src={imageUrl} alt={altText} />

<!-- Dynamic class name -->
<p class={isLarge ? "text-large" : "text-small"}>
  Dynamic sizing!
</p>

<!-- Dynamic href -->
<a href={linkUrl}>Visit Svelte</a>

<style>
  .text-large { font-size: 2rem; }
  .text-small { font-size: 0.8rem; }
</style>
```

When the entire attribute value is a single expression, you can drop the quotes: `src={imageUrl}` instead of `src="{imageUrl}"`.

## Formatting Numbers and Dates

Expressions in curly braces let you format data nicely:

```svelte
<script>
  let price = 1499.5;
  let percentage = 0.8567;
  let today = new Date();
</script>

<!-- Fixed decimal places -->
<p>Price: ${price.toFixed(2)}</p>

<!-- Percentage -->
<p>Score: {(percentage * 100).toFixed(1)}%</p>

<!-- Date formatting -->
<p>Today: {today.toLocaleDateString()}</p>
```

## A Complete Example

```svelte
<script>
  let product = "Svelte Bootcamp";
  let originalPrice = 99.99;
  let discount = 0.2;
  let quantity = $state(1);

  let salePrice = originalPrice * (1 - discount);
</script>

<div class="receipt">
  <h2>{product}</h2>
  <p>Original: <del>${originalPrice.toFixed(2)}</del></p>
  <p>Sale ({discount * 100}% off): <strong>${salePrice.toFixed(2)}</strong></p>
  <p>Quantity: {quantity}</p>
  <hr />
  <p class="total">Total: ${(salePrice * quantity).toFixed(2)}</p>
</div>

<style>
  .receipt {
    max-width: 300px;
    padding: 24px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-family: monospace;
  }

  .total {
    font-size: 1.4rem;
    font-weight: bold;
    color: #27ae60;
  }
</style>
```

## Try It

Build a "Tip Calculator" component that:
- Has variables for `billAmount` and `tipPercentage`
- Displays the tip amount using `{billAmount * tipPercentage}`
- Shows the total bill (amount + tip)
- Formats all money values to 2 decimal places with `.toFixed(2)`
- Uses template literals somewhere in the display

## Key Takeaways

- Any JavaScript expression can go inside `{}` in Svelte markup
- Template literals use backticks and `${}` for easier string building
- Curly braces work in both text content and HTML attributes
- Use `.toFixed(2)` for money, `.toUpperCase()` / `.toLowerCase()` for text
- Keep complex calculations in the `<script>` tag and display results in markup
