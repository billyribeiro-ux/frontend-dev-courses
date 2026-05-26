# Objects & Arrays in Depth

So far you have worked with simple values — a string, a number, a boolean. But real applications deal with richer data: a user has a name, an email, and an age. A product has a title, a price, and a description. A shopping cart is an array of objects, each with nested properties. **Objects** and **arrays** let you group related values together, and understanding how Svelte 5's reactivity system handles them is essential for building anything beyond a trivial counter.

This lesson starts with JavaScript object and array fundamentals, then goes deep into how `$state` makes them reactive, the Proxy mechanism under the hood, the difference between deep and shallow reactivity, and the tools Svelte gives you for working with complex data: `$state.raw`, `$state.snapshot`, and reactive class fields. Every pattern you will use in production — nested form editors, sortable lists, tree structures, undo/redo — depends on what you learn here.

## Object Literal Syntax

You create an object with curly braces `{}` and list key-value pairs separated by commas:

```svelte
<script>
  const person = {
    name: "Alex",
    age: 28,
    email: "alex@example.com",
    isStudent: false
  };
</script>

<p>Name: {person.name}</p>
<p>Age: {person.age}</p>
<p>Email: {person.email}</p>
<p>Student: {person.isStudent ? "Yes" : "No"}</p>
```

Each **key** (also called a property name) is followed by a colon and its **value**. Values can be any type — strings, numbers, booleans, arrays, or even other objects.

## Accessing Properties

There are two ways to read a value from an object:

**Dot notation** is the most common and cleanest approach:

```typescript
const product = { name: "Laptop", price: 999 };

console.log(product.name);  // "Laptop"
console.log(product.price); // 999
```

**Bracket notation** uses a string key inside square brackets. This is useful when the property name is stored in a variable or contains special characters:

```typescript
const product = { name: "Laptop", price: 999 };

const key = "name";
console.log(product[key]);        // "Laptop"
console.log(product["price"]);    // 999
```

Use dot notation by default. Reach for bracket notation when you need dynamic property access.

## Nested Objects

Objects can contain other objects. This is how you model complex, real-world data:

```svelte
<script>
  const user = {
    name: "Jordan",
    age: 32,
    address: {
      street: "123 Main St",
      city: "Portland",
      state: "OR"
    },
    social: {
      twitter: "@jordan_dev",
      github: "jordan-codes"
    }
  };
</script>

<h2>{user.name}</h2>
<p>Lives in {user.address.city}, {user.address.state}</p>
<p>GitHub: {user.social.github}</p>
```

You chain dot notation to access deeply nested properties: `user.address.city` reads the `city` inside `address` inside `user`.

## Destructuring

**Destructuring** lets you extract properties from an object into standalone variables. Instead of writing `person.name` and `person.age` everywhere, you pull them out in one clean line:

```typescript
const person = { name: "Alex", age: 28, email: "alex@example.com" };

// Without destructuring
const name = person.name;
const age = person.age;

// With destructuring — same result, much cleaner
const { name, age, email } = person;

console.log(name);  // "Alex"
console.log(age);   // 28
console.log(email); // "alex@example.com"
```

You can also set **default values** for properties that might not exist:

```typescript
const person = { name: "Alex" };

const { name, role = "user", theme = "light" } = person;

console.log(name);  // "Alex"
console.log(role);  // "user" (default, since person has no role)
console.log(theme); // "light" (default)
```

Destructuring is extremely common in Svelte components, especially when working with props and API data.

## Arrays of Objects

In real applications, you almost always work with **arrays of objects** — a list of users, products, blog posts, or tasks. This pattern is the bridge to rendering lists with Svelte's `{#each}` block:

```svelte
<script>
  const team = [
    { id: 1, name: "Alex", role: "Designer" },
    { id: 2, name: "Sam", role: "Developer" },
    { id: 3, name: "Jordan", role: "Manager" }
  ];
</script>

<h2>Team Members</h2>
<ul>
  {#each team as member (member.id)}
    <li><strong>{member.name}</strong> — {member.role}</li>
  {/each}
</ul>
```

Each object in the array represents one item, and you iterate over them to build dynamic UIs.

## Object Spread

The **spread operator** (`...`) copies all properties from one object into a new one. This is how you create updated copies without mutating the original:

```typescript
const defaults = { theme: "light", fontSize: 16, language: "en" };

// Create a new object with all defaults, but override theme
const userSettings = { ...defaults, theme: "dark" };

console.log(userSettings);
// { theme: "dark", fontSize: 16, language: "en" }
```

Properties listed after the spread override matching keys. This pattern is essential for updating state in Svelte:

```typescript
const user = { name: "Alex", age: 28, city: "NYC" };

// Add a new property and update an existing one
const updatedUser = { ...user, age: 29, email: "alex@example.com" };

console.log(updatedUser);
// { name: "Alex", age: 29, city: "NYC", email: "alex@example.com" }
```

## How $state Makes Objects Reactive

When you wrap an object in `$state()`, Svelte makes the entire object reactive. You can mutate individual properties directly, and the UI updates automatically:

```svelte
<script>
  let settings = $state({
    theme: "light",
    fontSize: 16,
    notifications: true
  });
</script>

<p>Theme: {settings.theme}</p>
<p>Font Size: {settings.fontSize}px</p>

<button onclick={() => settings.theme = settings.theme === "light" ? "dark" : "light"}>
  Toggle Theme
</button>

<button onclick={() => settings.fontSize++}>
  Increase Font Size
</button>
```

This works because `$state()` creates a **deep reactive proxy**.

### What the Proxy Actually Does

Under the hood, `$state()` wraps your object in a JavaScript `Proxy`. The Proxy intercepts property access (the `get` trap) and property assignment (the `set` trap):

```
Original object: { theme: "light", fontSize: 16 }
                     ↓
$state() wraps it in a Proxy
                     ↓
When you READ settings.theme:
  → Proxy get trap fires
  → Svelte records this as a dependency of the current effect/derived
  → Returns "light"

When you WRITE settings.theme = "dark":
  → Proxy set trap fires
  → Svelte marks the property as changed
  → All effects/components that read settings.theme are scheduled for re-run
```

This is why direct property mutation works in Svelte 5 but not in Svelte 4. In Svelte 4, you had to reassign the entire variable (`settings = { ...settings, theme: "dark" }`) to trigger reactivity. In Svelte 5, the Proxy catches the mutation at the property level.

### Deep Reactivity

The Proxy is applied recursively. When you access a nested object, the returned value is itself wrapped in a Proxy:

```svelte
<script>
  let user = $state({
    name: "Alex",
    address: {
      city: "Portland",
      state: "OR",
      zip: {
        code: "97201",
        plus4: "1234"
      }
    }
  });

  function updateZip() {
    // This works! Deep reactivity means Svelte tracks changes
    // at any nesting depth
    user.address.zip.code = "97202";
  }
</script>

<p>ZIP: {user.address.zip.code}</p>
<button onclick={updateZip}>Change ZIP</button>
```

When you write `user.address.zip.code = "97202"`:
1. `user.address` triggers the Proxy get trap (Svelte tracks the dependency)
2. The returned `address` object is also a Proxy
3. `address.zip` triggers another get trap
4. The returned `zip` object is also a Proxy
5. `zip.code = "97202"` triggers the set trap
6. Svelte schedules a re-render for any component that reads `user.address.zip.code`

This chain of Proxies makes deep reactivity work automatically without you needing to think about it for most cases.

## Array Reactivity

Arrays in `$state` are also proxied. This means array mutation methods work reactively:

```svelte
<script>
  let todos = $state([
    { id: 1, text: "Learn Svelte", done: false },
    { id: 2, text: "Build a project", done: false }
  ]);

  let nextId = 3;

  function addTodo(text) {
    // push() works — Svelte's Proxy detects the mutation
    todos.push({ id: nextId++, text, done: false });
  }

  function removeTodo(id) {
    // Reassignment with filter also works
    const index = todos.findIndex(t => t.id === id);
    if (index !== -1) {
      todos.splice(index, 1);
    }
  }

  function toggleTodo(id) {
    // Direct property mutation on a nested object
    const todo = todos.find(t => t.id === id);
    if (todo) {
      todo.done = !todo.done;
    }
  }
</script>

<ul>
  {#each todos as todo (todo.id)}
    <li class:done={todo.done}>
      <input type="checkbox" checked={todo.done} onchange={() => toggleTodo(todo.id)} />
      {todo.text}
      <button onclick={() => removeTodo(todo.id)}>Delete</button>
    </li>
  {/each}
</ul>

<button onclick={() => addTodo(`Task ${nextId}`)}>Add Todo</button>
```

### Which Array Methods Are Reactive?

All of them. The Proxy intercepts every property access and mutation on the array. Here is a comprehensive list:

**Mutating methods** (modify the array in place — all trigger reactivity):
- `push()` — add to end
- `pop()` — remove from end
- `shift()` — remove from beginning
- `unshift()` — add to beginning
- `splice()` — add/remove at any position
- `sort()` — sort in place
- `reverse()` — reverse in place
- `fill()` — fill with a value
- `copyWithin()` — copy within the array

**Non-mutating methods** (return new values — safe to use anywhere):
- `filter()`, `map()`, `slice()`, `concat()`, `flat()`, `flatMap()`
- `find()`, `findIndex()`, `indexOf()`, `includes()`
- `every()`, `some()`, `reduce()`, `forEach()`

Both categories work with `$state`. The mutating methods trigger reactivity because the Proxy catches the internal property changes. The non-mutating methods work because they read properties through the Proxy, establishing dependencies.

```svelte
<script>
  let items = $state([5, 3, 1, 4, 2]);

  function sortItems() {
    // In-place sort — Svelte detects the mutation
    items.sort((a, b) => a - b);
  }

  function reverseItems() {
    // In-place reverse — Svelte detects the mutation
    items.reverse();
  }

  function addItem() {
    items.push(Math.floor(Math.random() * 100));
  }

  function removeFirst() {
    items.shift();
  }
</script>

<p>Items: {items.join(', ')}</p>
<button onclick={sortItems}>Sort</button>
<button onclick={reverseItems}>Reverse</button>
<button onclick={addItem}>Add Random</button>
<button onclick={removeFirst}>Remove First</button>
```

### Mutation vs Reassignment: Both Work, Choose Wisely

In Svelte 5, you have a genuine choice between mutation and reassignment:

```svelte
<script>
  let items = $state(["a", "b", "c"]);

  // Approach 1: Mutation (works in Svelte 5)
  function addWithMutation() {
    items.push("d");
  }

  // Approach 2: Reassignment (works in Svelte 4 AND 5)
  function addWithReassignment() {
    items = [...items, "d"];
  }
</script>
```

When to use which:

**Mutation** (`push`, `splice`, etc.):
- Simpler, less boilerplate
- More performant for large arrays (no copying)
- Natural when you think of the array as a living collection

**Reassignment** (`items = [...items, newItem]`):
- Functional programming style
- Creates a new array reference (useful for comparison checks)
- Required in Svelte 4 (important for migration awareness)
- Easier to reason about in complex transformations

For most cases, mutation is fine and simpler. Use reassignment when you specifically need a new array reference (e.g., for cache invalidation or when passing to a component that checks reference equality).

## Nested Object Updates

Updating deeply nested state is where many developers get confused. Here are the patterns:

### Direct Mutation (Preferred in Svelte 5)

```svelte
<script>
  let state = $state({
    user: {
      profile: {
        name: "Alex",
        settings: {
          theme: "light",
          notifications: {
            email: true,
            push: false,
            sms: false
          }
        }
      }
    }
  });

  function toggleEmailNotifications() {
    // Direct deep mutation — works perfectly with $state Proxy
    state.user.profile.settings.notifications.email =
      !state.user.profile.settings.notifications.email;
  }

  function updateTheme(newTheme) {
    state.user.profile.settings.theme = newTheme;
  }

  function updateName(name) {
    state.user.profile.name = name;
  }
</script>

<p>Name: {state.user.profile.name}</p>
<p>Theme: {state.user.profile.settings.theme}</p>
<p>Email notifications: {state.user.profile.settings.notifications.email ? 'On' : 'Off'}</p>

<input value={state.user.profile.name} oninput={(e) => updateName(e.target.value)} />
<button onclick={toggleEmailNotifications}>Toggle Email</button>
<button onclick={() => updateTheme('dark')}>Dark Mode</button>
```

### Immutable Spread Pattern (Alternative)

If you prefer the immutable style (or are working with code that expects new references):

```svelte
<script>
  let state = $state({
    user: {
      name: "Alex",
      settings: { theme: "light", fontSize: 16 }
    }
  });

  function updateTheme(newTheme) {
    // Immutable update — creates new objects at every level
    state = {
      ...state,
      user: {
        ...state.user,
        settings: {
          ...state.user.settings,
          theme: newTheme
        }
      }
    };
  }
</script>
```

The immutable pattern is verbose for deeply nested data. In Svelte 5, direct mutation is usually cleaner and more performant. The spread pattern creates new objects at every level of nesting, which means more garbage collection.

## $state.raw — Shallow Reactivity for Performance

When you have a large dataset that rarely changes or that you always replace wholesale, deep reactivity is wasteful. Creating Proxies for every nested object in a 10,000-item array adds measurable overhead. `$state.raw` creates a reactive value that only triggers updates when the entire variable is reassigned — it does NOT create Proxies for the value's contents:

```svelte
<script>
  // This is a large dataset fetched from an API
  // We never mutate individual items — we always replace the whole array
  let products = $state.raw([]);

  async function loadProducts() {
    const response = await fetch('/api/products');
    // Reassignment triggers reactivity
    products = await response.json();
  }

  async function filterProducts(category) {
    const response = await fetch(`/api/products?category=${category}`);
    // Reassignment triggers reactivity
    products = await response.json();
  }
</script>

<button onclick={loadProducts}>Load Products</button>

{#each products as product (product.id)}
  <div>{product.name} - ${product.price}</div>
{/each}
```

### When to Use $state.raw

Use `$state.raw` when:
- The data is large (hundreds or thousands of items) and performance matters
- You always replace the entire value, never mutate individual properties
- The data comes from an external source (API, database) and is treated as immutable
- You are storing data that should not be reactive at the property level (e.g., a configuration blob)

Do NOT use `$state.raw` when:
- You need to mutate individual properties and have the UI update
- The data is small (the Proxy overhead is negligible for small objects)
- You need two-way binding to nested properties

```svelte
<script>
  // WRONG — mutation does NOT trigger updates with $state.raw
  let settings = $state.raw({ theme: "light", fontSize: 16 });

  function toggleTheme() {
    settings.theme = "dark"; // Nothing happens! No Proxy, no reactivity.
  }

  // CORRECT — reassignment triggers updates with $state.raw
  function toggleThemeCorrectly() {
    settings = { ...settings, theme: settings.theme === "light" ? "dark" : "light" };
  }
</script>
```

### Performance Comparison

For a list of 5,000 items:

```svelte
<script>
  // With $state: creates ~5,000 Proxies, one per item
  // Each item's properties are individually reactive
  // Memory overhead: ~20-40 bytes per Proxy
  let itemsDeep = $state(generateItems(5000));

  // With $state.raw: zero Proxies for contents
  // Only the array reference is reactive
  // Much lower memory footprint
  let itemsShallow = $state.raw(generateItems(5000));

  // To update a single item with $state:
  function updateItemDeep(id, value) {
    const item = itemsDeep.find(i => i.id === id);
    if (item) item.value = value; // Works, triggers re-render
  }

  // To update a single item with $state.raw:
  function updateItemShallow(id, value) {
    // Must replace the entire array
    itemsShallow = itemsShallow.map(i =>
      i.id === id ? { ...i, value } : i
    );
  }
</script>
```

The `$state.raw` approach uses less memory and has faster initialization, but updating a single item requires creating a new array. For data that changes frequently at the item level, `$state` is better. For data that changes rarely or always changes in bulk, `$state.raw` wins.

## $state.snapshot — Getting Plain Data

The `$state.snapshot()` function returns a plain (non-reactive) copy of a `$state` value. This is essential when you need to pass state to code that does not understand Proxies — for example, `JSON.stringify`, `structuredClone`, `postMessage`, or external libraries:

```svelte
<script>
  let formData = $state({
    name: "Alex",
    email: "alex@example.com",
    preferences: {
      newsletter: true,
      theme: "dark"
    }
  });

  async function submitForm() {
    // Get a plain object copy (no Proxies)
    const data = $state.snapshot(formData);

    // Now safe to use with JSON.stringify, fetch, etc.
    await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  function logState() {
    // Without snapshot, console.log shows the Proxy wrapper
    console.log(formData); // Proxy { ... }

    // With snapshot, you get a clean plain object
    console.log($state.snapshot(formData)); // { name: "Alex", ... }
  }

  function saveToLocalStorage() {
    // localStorage needs a plain value for JSON.stringify
    const snapshot = $state.snapshot(formData);
    localStorage.setItem('formData', JSON.stringify(snapshot));
  }
</script>
```

### When You Need $state.snapshot

The most common scenarios:

1. **Sending to an API**: `JSON.stringify()` works on Proxies, but some serializers or validation libraries do not.
2. **Saving to localStorage**: `JSON.stringify()` on a Proxy works, but being explicit about getting a plain copy is clearer.
3. **Passing to third-party libraries**: Libraries like Lodash, Immer, or form validation tools may not handle Proxies correctly.
4. **Creating undo/redo snapshots**: You need a frozen copy of state at a point in time.
5. **Comparing state**: Object comparison (`===`) on Proxies compares the Proxy wrapper, not the underlying data. Use `$state.snapshot()` for value comparison.
6. **Worker threads**: `postMessage` cannot clone Proxies. Snapshot first.

```svelte
<script>
  let history = [];
  let state = $state({ count: 0, items: [] });

  function saveSnapshot() {
    // Take a frozen copy of current state
    history.push($state.snapshot(state));
  }

  function undo() {
    if (history.length === 0) return;
    const previous = history.pop();
    // Restore: replace the $state value entirely
    state.count = previous.count;
    state.items = previous.items;
  }
</script>
```

## Map and Set with $state

JavaScript `Map` and `Set` objects can also be used with `$state`. Svelte's Proxy system supports them:

```svelte
<script>
  let userMap = $state(new Map([
    ['alice', { name: 'Alice', role: 'admin' }],
    ['bob', { name: 'Bob', role: 'user' }]
  ]));

  let selectedTags = $state(new Set(['svelte', 'javascript']));

  function addUser(id, user) {
    userMap.set(id, user);
  }

  function removeUser(id) {
    userMap.delete(id);
  }

  function toggleTag(tag) {
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
    } else {
      selectedTags.add(tag);
    }
  }
</script>

<h3>Users ({userMap.size})</h3>
{#each userMap.entries() as [id, user]}
  <div>
    <strong>{user.name}</strong> ({user.role})
    <button onclick={() => removeUser(id)}>Remove</button>
  </div>
{/each}

<button onclick={() => addUser('charlie', { name: 'Charlie', role: 'user' })}>
  Add Charlie
</button>

<h3>Tags</h3>
{#each ['svelte', 'javascript', 'typescript', 'css', 'html'] as tag}
  <label>
    <input
      type="checkbox"
      checked={selectedTags.has(tag)}
      onchange={() => toggleTag(tag)}
    />
    {tag}
  </label>
{/each}

<p>Selected: {[...selectedTags].join(', ')}</p>
```

Map and Set methods (`set`, `delete`, `add`, `clear`) are all reactive because Svelte's Proxy intercepts them. This is useful for:

- **User lookups**: `Map<string, User>` is O(1) lookup vs O(n) for finding in an array
- **Unique collections**: `Set` guarantees uniqueness automatically
- **Counting/grouping**: `Map<string, number>` for frequency counts

### When to Use Map/Set vs Objects/Arrays

```svelte
<script>
  // Use Map when:
  // - Keys are not strings (numbers, objects, etc.)
  // - You need frequent addition/deletion
  // - You need to know the size
  // - Insertion order matters
  let cache = $state(new Map());

  // Use Set when:
  // - You need unique values
  // - You need fast has() checks
  // - Order does not matter
  let selectedIds = $state(new Set());

  // Use plain objects/arrays when:
  // - Data is JSON-serializable (API responses)
  // - You need destructuring
  // - You need spread operator
  let config = $state({ theme: "dark" });
  let items = $state([1, 2, 3]);
</script>
```

## Class Instances with $state Fields

You can use `$state` inside class definitions to create reactive class instances. This is a powerful pattern for encapsulating state and behavior:

```svelte
<script>
  class Counter {
    count = $state(0);
    name;

    constructor(name, initial = 0) {
      this.name = name;
      this.count = initial;
    }

    increment() {
      this.count++;
    }

    decrement() {
      if (this.count > 0) this.count--;
    }

    reset() {
      this.count = 0;
    }
  }

  let counter = new Counter("Main", 10);
</script>

<h3>{counter.name}: {counter.count}</h3>
<button onclick={() => counter.increment()}>+</button>
<button onclick={() => counter.decrement()}>-</button>
<button onclick={() => counter.reset()}>Reset</button>
```

### Reactive Derived Values in Classes

Combine `$state` with `$derived` in classes for computed properties:

```svelte
<script>
  class ShoppingCart {
    items = $state([]);
    taxRate = $state(0.08);

    subtotal = $derived(
      this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    );

    tax = $derived(this.subtotal * this.taxRate);
    total = $derived(this.subtotal + this.tax);

    itemCount = $derived(
      this.items.reduce((sum, item) => sum + item.quantity, 0)
    );

    addItem(product) {
      const existing = this.items.find(i => i.id === product.id);
      if (existing) {
        existing.quantity++;
      } else {
        this.items.push({ ...product, quantity: 1 });
      }
    }

    removeItem(id) {
      const index = this.items.findIndex(i => i.id === id);
      if (index !== -1) {
        this.items.splice(index, 1);
      }
    }

    updateQuantity(id, quantity) {
      const item = this.items.find(i => i.id === id);
      if (item) {
        item.quantity = Math.max(0, quantity);
        if (item.quantity === 0) {
          this.removeItem(id);
        }
      }
    }

    clear() {
      this.items = [];
    }
  }

  let cart = new ShoppingCart();

  const products = [
    { id: 1, name: "Widget", price: 9.99 },
    { id: 2, name: "Gadget", price: 24.99 },
    { id: 3, name: "Doohickey", price: 14.99 }
  ];
</script>

<h2>Products</h2>
{#each products as product}
  <div class="product">
    <span>{product.name} — ${product.price.toFixed(2)}</span>
    <button onclick={() => cart.addItem(product)}>Add to Cart</button>
  </div>
{/each}

<h2>Cart ({cart.itemCount} items)</h2>
{#each cart.items as item (item.id)}
  <div class="cart-item">
    <span>{item.name} x{item.quantity}</span>
    <span>${(item.price * item.quantity).toFixed(2)}</span>
    <button onclick={() => cart.updateQuantity(item.id, item.quantity - 1)}>-</button>
    <button onclick={() => cart.updateQuantity(item.id, item.quantity + 1)}>+</button>
    <button onclick={() => cart.removeItem(item.id)}>Remove</button>
  </div>
{/each}

<div class="totals">
  <p>Subtotal: ${cart.subtotal.toFixed(2)}</p>
  <p>Tax: ${cart.tax.toFixed(2)}</p>
  <p><strong>Total: ${cart.total.toFixed(2)}</strong></p>
</div>

{#if cart.items.length > 0}
  <button onclick={() => cart.clear()}>Clear Cart</button>
{/if}

<style>
  .product, .cart-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }
  .totals {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }
</style>
```

### Classes vs Plain Objects

When to use each:

**Plain `$state` objects**: Simple data, no behavior, when you just need reactive properties. Good for form data, configuration, simple models.

**Classes with `$state` fields**: When you need encapsulated behavior (methods), derived values (`$derived`), or when the data model is complex enough to benefit from OOP organization.

```typescript
// Simple data → plain object
let filter = $state({ search: '', category: 'all', sort: 'name' });

// Complex behavior → class
class FilteredList {
  items = $state.raw([]);
  search = $state('');
  category = $state('all');
  sortBy = $state('name');

  filtered = $derived(
    this.items
      .filter(i => i.name.toLowerCase().includes(this.search.toLowerCase()))
      .filter(i => this.category === 'all' || i.category === this.category)
      .sort((a, b) => a[this.sortBy].localeCompare(b[this.sortBy]))
  );
}
```

## Complete Nested Data Editing UI

Here is a production-style example: a settings editor that demonstrates nested object reactivity, array manipulation, and `$state.snapshot` for saving:

```svelte
<script>
  let config = $state({
    app: {
      name: "My Application",
      version: "2.1.0",
      environment: "production"
    },
    database: {
      host: "db.example.com",
      port: 5432,
      credentials: {
        username: "admin",
        password: ""
      },
      pools: [
        { name: "primary", size: 10, timeout: 5000 },
        { name: "readonly", size: 5, timeout: 3000 }
      ]
    },
    features: {
      darkMode: true,
      betaFeatures: false,
      allowedOrigins: ["https://example.com", "https://app.example.com"]
    }
  });

  let saveStatus = $state('');

  function addPool() {
    config.database.pools.push({
      name: `pool-${config.database.pools.length + 1}`,
      size: 5,
      timeout: 3000
    });
  }

  function removePool(index) {
    config.database.pools.splice(index, 1);
  }

  function addOrigin() {
    config.features.allowedOrigins.push("https://");
  }

  function removeOrigin(index) {
    config.features.allowedOrigins.splice(index, 1);
  }

  async function saveConfig() {
    saveStatus = 'saving';
    const snapshot = $state.snapshot(config);

    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));
    console.log('Saving config:', JSON.stringify(snapshot, null, 2));

    saveStatus = 'saved';
    setTimeout(() => saveStatus = '', 2000);
  }
</script>

<div class="editor">
  <h2>Application Settings</h2>

  <section>
    <h3>General</h3>
    <label>
      App Name
      <input bind:value={config.app.name} />
    </label>
    <label>
      Version
      <input bind:value={config.app.version} />
    </label>
    <label>
      Environment
      <select bind:value={config.app.environment}>
        <option value="development">Development</option>
        <option value="staging">Staging</option>
        <option value="production">Production</option>
      </select>
    </label>
  </section>

  <section>
    <h3>Database</h3>
    <label>
      Host
      <input bind:value={config.database.host} />
    </label>
    <label>
      Port
      <input type="number" bind:value={config.database.port} />
    </label>
    <label>
      Username
      <input bind:value={config.database.credentials.username} />
    </label>
    <label>
      Password
      <input type="password" bind:value={config.database.credentials.password} />
    </label>

    <h4>Connection Pools</h4>
    {#each config.database.pools as pool, index}
      <div class="pool-row">
        <input bind:value={pool.name} placeholder="Pool name" />
        <input type="number" bind:value={pool.size} placeholder="Size" />
        <input type="number" bind:value={pool.timeout} placeholder="Timeout (ms)" />
        <button onclick={() => removePool(index)}>Remove</button>
      </div>
    {/each}
    <button onclick={addPool}>Add Pool</button>
  </section>

  <section>
    <h3>Features</h3>
    <label class="checkbox">
      <input type="checkbox" bind:checked={config.features.darkMode} />
      Dark Mode
    </label>
    <label class="checkbox">
      <input type="checkbox" bind:checked={config.features.betaFeatures} />
      Beta Features
    </label>

    <h4>Allowed Origins</h4>
    {#each config.features.allowedOrigins as _, index}
      <div class="origin-row">
        <input bind:value={config.features.allowedOrigins[index]} />
        <button onclick={() => removeOrigin(index)}>Remove</button>
      </div>
    {/each}
    <button onclick={addOrigin}>Add Origin</button>
  </section>

  <div class="actions">
    <button class="save" onclick={saveConfig} disabled={saveStatus === 'saving'}>
      {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Configuration'}
    </button>
  </div>
</div>

<style>
  .editor {
    max-width: 600px;
    font-family: system-ui, sans-serif;
  }

  section {
    margin-bottom: 24px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  h3 {
    margin-top: 0;
    font-size: 1.1rem;
  }

  label {
    display: block;
    margin-bottom: 12px;
    font-size: 0.9rem;
    color: #374151;
  }

  label.checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  input, select {
    display: block;
    width: 100%;
    padding: 8px;
    margin-top: 4px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  input[type="checkbox"] {
    width: auto;
    display: inline;
  }

  .pool-row, .origin-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
  }

  .pool-row input, .origin-row input {
    margin-top: 0;
  }

  button {
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
  }

  button.save {
    background: #2563eb;
    color: white;
    border: none;
    padding: 10px 24px;
    font-size: 1rem;
  }

  button.save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .actions {
    margin-top: 16px;
    text-align: right;
  }
</style>
```

This example demonstrates:
- Deep nested object binding (`config.database.credentials.username`)
- Array mutation for pools and origins (`push`, `splice`)
- Binding to array elements by index (`config.features.allowedOrigins[index]`)
- `$state.snapshot` for serializing to JSON before saving
- All updates are reactive without any manual re-assignment

## Common Mistakes

**Mistake 1: Destructuring breaks reactivity**

```svelte
<script>
  let user = $state({ name: "Alex", age: 28 });

  // WRONG — destructuring creates plain variables, not reactive references
  let { name, age } = user;
  // Changing user.name does NOT update `name`
  // Changing `name` does NOT update user.name

  // CORRECT — access through the reactive object
  // Use user.name and user.age directly in the template
</script>

<!-- WRONG -->
<p>{name}</p>

<!-- CORRECT -->
<p>{user.name}</p>
```

Destructuring extracts the values at that moment in time. The destructured variables are not connected to the reactive Proxy. Always access reactive properties through the original `$state` object.

**Mistake 2: Replacing a nested object with a new one outside the Proxy chain**

```svelte
<script>
  let state = $state({
    settings: { theme: "light" }
  });

  // WRONG — storing a reference to a nested object breaks the chain
  let settingsRef = state.settings;
  settingsRef.theme = "dark"; // This actually WORKS because settingsRef is the Proxy

  // BUT this BREAKS reactivity:
  settingsRef = { theme: "dark" }; // Creates a new object, not connected to state
  // state.settings still points to the OLD object

  // CORRECT — assign through the state tree
  state.settings = { theme: "dark" }; // This replaces the nested object reactively
</script>
```

**Mistake 3: Trying to mutate $state.raw**

```svelte
<script>
  let items = $state.raw([{ id: 1, name: "Item" }]);

  // WRONG — $state.raw does not create Proxies for contents
  items[0].name = "Updated"; // No re-render!
  items.push({ id: 2, name: "New" }); // No re-render!

  // CORRECT — reassign the entire variable
  items = items.map(i => i.id === 1 ? { ...i, name: "Updated" } : i);
  items = [...items, { id: 2, name: "New" }];
</script>
```

## Try It

Build a "Contact Book" application with:
- A `$state` array of contacts, where each contact has: `name`, `email`, `phone`, `address` (nested object with `street`, `city`, `state`, `zip`), and `tags` (array of strings)
- An "Add Contact" form that pushes to the array
- Inline editing for every field — including nested address fields and the tags array
- A "Remove" button that uses `splice()` to delete a contact
- A `$derived` property that counts contacts per city
- An "Export" button that uses `$state.snapshot()` to generate downloadable JSON
- A `$state.raw` variable for a large "phonebook" dataset (1000+ entries) loaded from a mock API, demonstrating the performance difference

## Key Takeaways

- Objects group related data into key-value pairs using `{ key: value }` syntax
- Access properties with **dot notation** (`obj.key`) for most cases or **bracket notation** (`obj["key"]`) for dynamic keys
- Objects can be **nested** — objects inside objects model complex real-world data
- **Destructuring** (`const { name, age } = person`) extracts properties into standalone variables — but do not destructure `$state` objects if you need reactivity
- The **spread operator** (`{ ...obj, newProp: value }`) creates copies with updates
- `$state()` wraps objects in a **deep reactive Proxy** — Svelte intercepts `get` and `set` at every nesting depth
- All array mutation methods (`push`, `pop`, `splice`, `sort`, `reverse`, etc.) trigger reactive updates with `$state`
- **`$state.raw`** creates a variable that is only reactive on reassignment — no Proxies on contents, ideal for large immutable datasets
- **`$state.snapshot`** returns a plain (non-Proxy) copy of `$state` data — essential for `JSON.stringify`, `postMessage`, external libraries, and undo/redo systems
- **Map** and **Set** work with `$state` — their methods (`set`, `delete`, `add`, `clear`) are all reactive
- **Classes with `$state` fields** encapsulate reactive state and behavior — combine with `$derived` for computed properties
- **Destructuring breaks reactivity** — always access reactive properties through the original `$state` object, not through destructured variables
- Direct mutation vs immutable reassignment: both work in Svelte 5, choose based on your use case (mutation for simplicity, reassignment for functional patterns)
