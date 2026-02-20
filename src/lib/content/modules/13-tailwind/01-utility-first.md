# Utility-First CSS

Traditional CSS has you writing custom class names and style rules for every element: `.card-title`, `.nav-link`, `.hero-section`. Utility-first CSS flips this approach. Instead of inventing class names, you compose styles directly in your HTML using small, single-purpose utility classes like `text-lg`, `bg-white`, `p-4`, and `rounded-lg`.

Tailwind CSS is the most popular utility-first framework. It provides hundreds of pre-built utility classes that map to CSS properties. Once you get used to the approach, you can build complex layouts and components without ever leaving your markup. This lesson introduces the core concept and the most common utility classes.

## Traditional CSS vs Utility-First

Here is the same card built both ways:

**Traditional approach:**

```css
/* styles.css */
.card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.card-text {
  color: #666;
}
```

```svelte
<div class="card">
  <h3 class="card-title">My Card</h3>
  <p class="card-text">Card description here.</p>
</div>
```

**Utility-first approach (Tailwind):**

```svelte
<div class="bg-white p-6 rounded-xl shadow-md">
  <h3 class="text-xl font-bold mb-2">My Card</h3>
  <p class="text-gray-500">Card description here.</p>
</div>
```

No separate CSS file. No class names to invent. The styles are right there in the markup.

## Core Utility Classes

Here are the categories you will use most often:

### Spacing (padding & margin)

```svelte
<div class="p-4">Padding on all sides (1rem)</div>
<div class="px-6 py-2">Horizontal 1.5rem, vertical 0.5rem</div>
<div class="mt-4">Margin-top 1rem</div>
<div class="mb-8">Margin-bottom 2rem</div>
<div class="space-y-4">Vertical gap between children</div>
```

### Colors (text & background)

```svelte
<p class="text-gray-900">Dark text</p>
<p class="text-blue-600">Blue text</p>
<div class="bg-white">White background</div>
<div class="bg-gray-100">Light gray background</div>
```

### Typography

```svelte
<h1 class="text-3xl font-bold">Large bold heading</h1>
<p class="text-sm text-gray-500 leading-relaxed">
  Small muted text with relaxed line spacing.
</p>
```

### Borders & Radius

```svelte
<div class="border border-gray-200 rounded-lg">Bordered box</div>
<img class="rounded-full" src="/avatar.jpg" alt="Avatar" />
```

### Shadows

```svelte
<div class="shadow-sm">Subtle shadow</div>
<div class="shadow-md">Medium shadow</div>
<div class="shadow-lg">Large shadow</div>
```

## Responsive Prefixes

Tailwind uses breakpoint prefixes to apply styles at specific screen sizes:

```svelte
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div class="p-4 bg-white rounded-lg shadow">Card 1</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 2</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 3</div>
</div>
```

- No prefix = mobile first (all screen sizes)
- `md:` = medium screens (768px and up)
- `lg:` = large screens (1024px and up)
- `xl:` = extra large screens (1280px and up)

This is mobile-first responsive design — start with the mobile layout and add overrides for larger screens.

## State Variants

Apply styles on hover, focus, and other states using prefixes:

```svelte
<button class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-400 active:bg-blue-800 transition">
  Click me
</button>
```

## Try It

Convert an existing card component from scoped CSS to Tailwind utility classes. Add responsive behavior so it displays in a single column on mobile and two columns on desktop. Add hover effects to buttons and links.

## Key Takeaways

- **Utility-first CSS** composes styles from small, single-purpose classes in your HTML
- Core categories: spacing (`p-`, `m-`), colors (`text-`, `bg-`), typography (`text-`, `font-`), borders (`rounded-`, `border-`), shadows (`shadow-`)
- **Responsive prefixes** (`md:`, `lg:`, `xl:`) enable mobile-first responsive design
- **State prefixes** (`hover:`, `focus:`, `active:`) handle interactive states
- Tailwind eliminates the need to write custom CSS for most UI work
- You can still use Svelte scoped styles alongside Tailwind when needed
