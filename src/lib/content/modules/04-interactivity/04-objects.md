# Objects & Methods

So far you have worked with simple values — a string, a number, a boolean. But real applications deal with richer data: a user has a name, an email, and an age. A product has a title, a price, and a description. **Objects** let you group related values together into a single variable, making your code organized and your data easy to work with.

Think of an object like an ID card. Instead of carrying separate slips of paper for your name, birthday, and address, everything lives on one card. In JavaScript, objects are collections of **key-value pairs**, and they are one of the most important data structures you will use every day.

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

In real applications, you almost always work with **arrays of objects** — a list of users, products, blog posts, or tasks. This pattern is the bridge to rendering lists with Svelte's `{#each}` block (covered in Module 06):

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

Properties listed after the spread override matching keys. This pattern is essential for updating state in Svelte.

```typescript
const user = { name: "Alex", age: 28, city: "NYC" };

// Add a new property and update an existing one
const updatedUser = { ...user, age: 29, email: "alex@example.com" };

console.log(updatedUser);
// { name: "Alex", age: 29, city: "NYC", email: "alex@example.com" }
```

## Using Objects with $state()

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

This works because `$state()` creates a **deep reactive proxy** — Svelte tracks changes to nested properties, not just reassignment of the whole variable.

## Practical Example: Profile Card Component

Here is a complete component that uses an object to manage a user profile:

```svelte
<script>
  let profile = $state({
    name: "Alex Rivera",
    title: "Frontend Developer",
    location: "Portland, OR",
    skills: ["Svelte", "TypeScript", "CSS"],
    isAvailable: true
  });

  let isEditing = $state(false);

  function toggleAvailability() {
    profile.isAvailable = !profile.isAvailable;
  }
</script>

<div class="card">
  <div class="header">
    <h2>{profile.name}</h2>
    <span class="badge" class:available={profile.isAvailable}>
      {profile.isAvailable ? "Available" : "Busy"}
    </span>
  </div>

  <p class="title">{profile.title}</p>
  <p class="location">{profile.location}</p>

  <div class="skills">
    {#each profile.skills as skill}
      <span class="skill-tag">{skill}</span>
    {/each}
  </div>

  <button onclick={toggleAvailability}>
    Mark as {profile.isAvailable ? "Busy" : "Available"}
  </button>
</div>

<style>
  .card {
    max-width: 360px;
    padding: 24px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    font-family: system-ui, sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    background: #fee2e2;
    color: #dc2626;
  }

  .badge.available {
    background: #dcfce7;
    color: #16a34a;
  }

  .title {
    color: #666;
    margin: 4px 0;
  }

  .location {
    color: #999;
    font-size: 0.9rem;
  }

  .skills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 16px 0;
  }

  .skill-tag {
    background: #f0f0f0;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  button {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: #3b82f6;
    color: white;
    font-size: 1rem;
    cursor: pointer;
  }

  button:hover {
    background: #2563eb;
  }
</style>
```

## Try It

Build a "Product Card" component with:
- A `$state()` object containing: `name`, `price`, `description`, `inStock` (boolean), and a nested `dimensions` object with `width` and `height`
- Display all properties using dot notation
- Use destructuring to extract `width` and `height` from `dimensions` in a derived display string
- Add a button that toggles `inStock` between true and false
- Use object spread to create a "discounted" version of the product with a lower price, and display both

## Key Takeaways

- Objects group related data into key-value pairs using `{ key: value }` syntax
- Access properties with **dot notation** (`obj.key`) for most cases or **bracket notation** (`obj["key"]`) for dynamic keys
- Objects can be **nested** — objects inside objects model complex real-world data
- **Destructuring** (`const { name, age } = person`) extracts properties into standalone variables
- Set **default values** in destructuring: `const { role = "user" } = person`
- **Arrays of objects** are the standard pattern for lists of data in real applications
- The **spread operator** (`{ ...obj, newProp: value }`) creates copies with updates
- Wrapping an object in `$state()` makes all its properties reactive — changes to nested values trigger UI updates automatically
