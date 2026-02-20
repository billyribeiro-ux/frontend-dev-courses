# Using Phosphor Icons

Your websites are functional, but they are probably missing something every polished site has — **icons**. Icons make interfaces more intuitive, buttons more recognizable, and navigation more scannable. Instead of creating your own or wrestling with icon fonts, we will use **Phosphor Icons**, a beautiful and flexible icon library with excellent Svelte support.

Phosphor gives you over 7,000 icons in six weights (thin, light, regular, bold, fill, duotone). Each icon is a Svelte component, so it fits perfectly into the workflow you already know.

## Installing Phosphor Icons

First, install the library in your project. Run this in your terminal:

```bash
npm install phosphor-svelte
```

That is it. No extra configuration needed.

## Importing Your First Icon

Each icon is imported individually. This keeps your bundle small — you only include the icons you actually use:

```svelte
<script>
  import House from "phosphor-svelte/lib/House";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import Heart from "phosphor-svelte/lib/Heart";
</script>

<House />
<MagnifyingGlass />
<Heart />
```

Icon names match the Phosphor catalog (PascalCase). Visit the [Phosphor Icons website](https://phosphoricons.com) to browse and search all available icons.

## Customizing Size

Control the icon size with the `size` prop. The default is `24`:

```svelte
<script>
  import Star from "phosphor-svelte/lib/Star";
</script>

<Star size={16} />  <!-- Small -->
<Star size={24} />  <!-- Default -->
<Star size={32} />  <!-- Medium -->
<Star size={48} />  <!-- Large -->
<Star size={64} />  <!-- Extra large -->
```

## Customizing Weight

Phosphor icons come in six visual weights:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
</script>

<Heart weight="thin" size={32} />
<Heart weight="light" size={32} />
<Heart weight="regular" size={32} />
<Heart weight="bold" size={32} />
<Heart weight="fill" size={32} />
<Heart weight="duotone" size={32} />
```

- `thin` — very delicate lines
- `light` — subtle and clean
- `regular` — the default, balanced look
- `bold` — thicker, more prominent
- `fill` — solid filled icons
- `duotone` — two-tone with depth

## Customizing Color

Set the icon color with the `color` prop or inherit it from the parent's CSS `color`:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  import Warning from "phosphor-svelte/lib/Warning";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
</script>

<!-- Explicit color prop -->
<Heart color="#e74c3c" size={32} weight="fill" />
<Warning color="#f39c12" size={32} weight="fill" />
<CheckCircle color="#27ae60" size={32} weight="fill" />

<!-- Inherits from parent CSS color -->
<p class="info">
  <CheckCircle size={20} /> This inherits the blue color.
</p>

<style>
  .info {
    color: #3498db;
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
```

## Icons in Buttons

One of the most common use cases is putting icons inside buttons:

```svelte
<script>
  import Trash from "phosphor-svelte/lib/Trash";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import Plus from "phosphor-svelte/lib/Plus";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
</script>

<button class="btn primary">
  <Plus size={18} /> Add Item
</button>

<button class="btn secondary">
  <PencilSimple size={18} /> Edit
</button>

<button class="btn danger">
  <Trash size={18} /> Delete
</button>

<button class="btn outline">
  <DownloadSimple size={18} /> Download
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    cursor: pointer;
    color: white;
  }

  .primary   { background: #3498db; }
  .secondary { background: #8e44ad; }
  .danger    { background: #e74c3c; }
  .outline   { background: white; color: #333; border: 1px solid #ddd; }
</style>
```

The key styling for icon buttons: `display: inline-flex`, `align-items: center`, and `gap` to space the icon and text evenly.

## Building an Icon Navbar

Here is a practical navigation bar using Phosphor icons:

```svelte
<script>
  import House from "phosphor-svelte/lib/House";
  import User from "phosphor-svelte/lib/User";
  import Gear from "phosphor-svelte/lib/Gear";
  import Bell from "phosphor-svelte/lib/Bell";
  import SignOut from "phosphor-svelte/lib/SignOut";
</script>

<nav class="navbar">
  <a href="/" class="nav-link">
    <House size={20} /> Home
  </a>
  <a href="/profile" class="nav-link">
    <User size={20} /> Profile
  </a>
  <a href="/settings" class="nav-link">
    <Gear size={20} /> Settings
  </a>
  <a href="/notifications" class="nav-link">
    <Bell size={20} /> Alerts
  </a>
  <a href="/logout" class="nav-link logout">
    <SignOut size={20} /> Logout
  </a>
</nav>

<style>
  .navbar {
    display: flex;
    gap: 4px;
    padding: 12px;
    background: #2c3e50;
    border-radius: 8px;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    color: #ecf0f1;
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .nav-link:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .logout {
    margin-left: auto;
    color: #e74c3c;
  }
</style>
```

## Icon-Only Buttons

Sometimes you want buttons with just an icon and no text. Always add an `aria-label` for accessibility:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  import ShareNetwork from "phosphor-svelte/lib/ShareNetwork";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
</script>

<div class="actions">
  <button class="icon-btn" aria-label="Like">
    <Heart size={20} />
  </button>
  <button class="icon-btn" aria-label="Share">
    <ShareNetwork size={20} />
  </button>
  <button class="icon-btn" aria-label="Bookmark">
    <BookmarkSimple size={20} />
  </button>
</div>

<style>
  .actions {
    display: flex;
    gap: 8px;
  }

  .icon-btn {
    padding: 8px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
  }

  .icon-btn:hover {
    background: #f0f0f0;
    color: #333;
  }
</style>
```

## Try It

Build a "Social Media Post" component with:
- Phosphor icons for like (Heart), comment (ChatCircle), and share (ShareNetwork)
- A like counter that increments when the Heart icon button is clicked
- Switch the Heart icon to `weight="fill"` when liked
- An icon navbar at the top of the page with at least four links

## Key Takeaways

- Install with `npm install phosphor-svelte`, import individual icons from `"phosphor-svelte/lib/IconName"`
- Customize icons with `size`, `weight`, and `color` props
- Six weights available: thin, light, regular, bold, fill, and duotone
- Use `display: inline-flex`, `align-items: center`, and `gap` to align icons in buttons
- Always add `aria-label` to icon-only buttons for screen reader accessibility
- Browse all icons at [phosphoricons.com](https://phosphoricons.com)
