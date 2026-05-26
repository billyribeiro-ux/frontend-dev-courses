# Using Icons in Svelte

Your websites are functional, but they are probably missing something every polished site has — **icons**. Icons make interfaces more intuitive, buttons more recognizable, and navigation more scannable. But choosing the right icon strategy is more important than most developers realize. A bad choice can bloat your bundle, break accessibility, and create maintenance headaches that follow you for years.

This lesson covers the full landscape of icon strategies, then goes deep on the practical choice for Svelte projects: **Phosphor Icons**.

## Icon Strategies: The Full Picture

Before picking a library, you need to understand the fundamentally different approaches to putting icons on a web page. Each has real trade-offs that affect performance, accessibility, styling flexibility, and developer experience.

### Strategy 1: Icon Fonts (Font Awesome, Material Icons)

Icon fonts encode each icon as a character in a custom font. You apply a CSS class and the "character" renders as an icon.

```html
<!-- Font Awesome icon font approach -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<i class="fa-solid fa-house"></i>
<i class="fa-solid fa-magnifying-glass"></i>
```

**Pros:**
- Easy to get started (just a CSS link)
- Color and size controlled via CSS `color` and `font-size`
- Single HTTP request for the font file

**Cons:**
- **All-or-nothing bundle.** Font Awesome's font file is around 150KB even if you use 3 icons. You download the entire icon set.
- **Anti-aliased as text.** Icons render with font hinting and anti-aliasing, which can look blurry at certain sizes, especially on Windows.
- **Accessibility challenges.** Screen readers may try to read icon "characters" as text. You need `aria-hidden="true"` on every icon and a separate visually-hidden text alternative.
- **No multicolor support.** Font icons are always a single color. No gradients, no duotone, no per-path styling.
- **Flash of invisible text (FOIT).** While the font loads, icons are invisible. Or worse, you get a flash of the wrong character from the fallback font.
- **Cannot tree-shake.** Bundlers cannot remove unused icons because they are all baked into a single font file.

> **Verdict:** Icon fonts were the standard approach from 2013-2018. They are a legacy pattern now. Do not use them in new projects.

### Strategy 2: Inline SVG

SVGs are XML-based vector graphics that live directly in your HTML. Each icon is a `<svg>` element with paths:

```html
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256">
  <path d="M224,120v96a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120..." fill="currentColor"/>
</svg>
```

**Pros:**
- **Full styling control.** You can style individual paths, add gradients, animate parts of the icon with CSS or JavaScript.
- **No network request.** The SVG is part of the HTML — no font to download.
- **Crisp at any size.** SVGs are resolution-independent vectors. No blurring.
- **Accessible by default.** You can add `<title>` elements inside SVGs and use `role="img"` with `aria-label`.
- **Tree-shakeable.** Only the icons you use end up in your bundle.

**Cons:**
- **Verbose markup.** Each SVG can be 5-20 lines of path data. Inline SVGs in templates get noisy fast.
- **No caching between pages.** If the same icon appears on 10 pages, the SVG is duplicated in each page's HTML.
- **Harder to manage.** Without a component abstraction, updating an icon means finding every inline SVG instance.

> **Verdict:** Inline SVGs are the foundation of modern icon systems. But you want a component wrapper around them, which is exactly what icon component libraries provide.

### Strategy 3: SVG Sprite Sheet

A sprite sheet defines all your icons in a single hidden SVG at the top of your page, then references them by ID:

```html
<!-- Define all icons once (usually in the layout) -->
<svg style="display: none;">
  <symbol id="icon-house" viewBox="0 0 256 256">
    <path d="M224,120v96..." fill="currentColor"/>
  </symbol>
  <symbol id="icon-heart" viewBox="0 0 256 256">
    <path d="M178,40c-20.7..." fill="currentColor"/>
  </symbol>
</svg>

<!-- Use them anywhere via <use> -->
<svg width="24" height="24"><use href="#icon-house"/></svg>
<svg width="24" height="24"><use href="#icon-heart"/></svg>
```

**Pros:**
- **Defined once, used many times.** The SVG data lives in one place, and `<use>` creates lightweight references.
- **Cacheable.** If the sprite is in an external file, the browser caches it across pages.
- **Stylable.** You can still use `currentColor` and some CSS properties.

**Cons:**
- **Manual management.** Adding a new icon means editing the sprite sheet. Removing one means finding and deleting the `<symbol>`.
- **Limited styling.** `<use>` creates a shadow DOM boundary, so you cannot style individual paths inside the referenced symbol from outside CSS.
- **Requires build tooling** or manual SVG wrangling to create the sprite file.
- **Does not tree-shake.** All icons in the sprite are in the bundle, whether used or not.

> **Verdict:** Sprite sheets are good for design systems with a curated, fixed set of icons. They are overkill for most Svelte projects where component-based icons are simpler.

### Strategy 4: Component Libraries (The Modern Approach)

Each icon is a standalone Svelte component. You import only what you use:

```svelte
<script>
  import House from "phosphor-svelte/lib/House";
</script>

<House size={24} />
```

**Pros:**
- **Perfect tree-shaking.** Your bundler only includes the icons you import. Use 5 icons out of 7,000? Only 5 ship.
- **Type-safe props.** Size, color, weight, and other options are typed and autocompleted by your IDE.
- **Encapsulated accessibility.** The component can handle `aria-hidden`, `role`, and `<title>` internally.
- **Consistent API.** Every icon has the same props. No CSS class guessing games.
- **Easy to update.** Bump the npm version and all icons update at once.

**Cons:**
- **One import per icon.** This is slightly more verbose than a CSS class, but your IDE's autocomplete makes it fast.
- **Build-time dependency.** The component code runs through your bundler, adding a small amount of build time.

> **Verdict:** This is the right approach for Svelte projects. We use **Phosphor Icons** because it has first-class Svelte support, six visual weights, and over 7,000 icons.

## The Mental Model: Icons Are Communication

Before touching more code, understand what icons actually do in a user interface. They serve three distinct purposes, and confusing them leads to poor UX and accessibility violations:

**1. Decorative icons** accompany text and reinforce meaning. A trash can icon next to the word "Delete." A heart icon next to "Favorites." These icons are redundant — if you removed them, the user would still understand the interface. Screen readers should **skip** these.

**2. Informative icons** convey meaning that is not present in the surrounding text. A warning triangle in an alert banner. A green checkmark indicating success. If you removed these, the user would lose information. Screen readers need an **accessible label** for these.

**3. Interactive icons** are clickable elements — icon-only buttons. A gear icon that opens settings. A search magnifying glass. These are both informative and interactive, so they need `aria-label` on the button element.

```
Decorative:     <button><Trash /> Delete</button>
                 ↑ Icon is redundant — text says "Delete"
                 Screen reader: "Delete, button"

Informative:    <span><Warning /> Connection lost</span>
                 ↑ Icon adds urgency to the message
                 Screen reader should convey the warning

Interactive:    <button aria-label="Settings"><Gear /></button>
                 ↑ Icon IS the label — no text present
                 Screen reader: "Settings, button"
```

Getting this distinction right is the difference between an accessible app and one that frustrates users with assistive technology.

## Installing Phosphor Icons

First, install the library in your project. Run this in your terminal:

```bash
npm install phosphor-svelte
```

That is it. No extra configuration, no Vite plugins, no font files to host. The package ships pre-compiled Svelte components.

## Importing Your First Icon

Each icon is imported individually from `phosphor-svelte/lib/`. This import path is critical — it enables tree-shaking:

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

Icon names match the Phosphor catalog in PascalCase. Visit the [Phosphor Icons website](https://phosphoricons.com) to browse and search all available icons.

### Why Import Paths Matter: Tree-Shaking Deep Dive

This is one of the most important performance concepts for icon libraries. Watch the difference:

```svelte
<script>
  // WRONG — imports the ENTIRE Phosphor library (~1.5MB)
  // Every single icon component gets bundled
  import { House, Heart } from "phosphor-svelte";

  // CORRECT — imports ONLY the House and Heart components (~2KB each)
  import House from "phosphor-svelte/lib/House";
  import Heart from "phosphor-svelte/lib/Heart";
</script>
```

When you import from the package root (`"phosphor-svelte"`), the bundler pulls in the barrel file that re-exports all 7,000+ icons. Even with tree-shaking, barrel files can defeat dead-code elimination because of potential side effects. The deep import path (`"phosphor-svelte/lib/House"`) bypasses the barrel file entirely — the bundler only loads the single file for that one icon.

> **Production war story:** I once joined a project where a developer had written `import { Heart } from "phosphor-svelte"` in a single component. The build worked fine. But the production bundle was 1.4MB larger than expected. It took two hours of bundle analysis to trace it back to that one import statement. The fix was changing one line. Always use the deep import path.

### Finding the Right Icon Name

The Phosphor catalog uses descriptive names. Here are common mappings:

| What you need | Icon name | Import |
|--------------|-----------|--------|
| Home | `House` | `phosphor-svelte/lib/House` |
| Search | `MagnifyingGlass` | `phosphor-svelte/lib/MagnifyingGlass` |
| Settings | `Gear` | `phosphor-svelte/lib/Gear` |
| Close / X | `X` | `phosphor-svelte/lib/X` |
| Menu (hamburger) | `List` | `phosphor-svelte/lib/List` |
| User / Profile | `User` | `phosphor-svelte/lib/User` |
| Arrow left | `ArrowLeft` | `phosphor-svelte/lib/ArrowLeft` |
| Chevron right | `CaretRight` | `phosphor-svelte/lib/CaretRight` |
| Edit / Pencil | `PencilSimple` | `phosphor-svelte/lib/PencilSimple` |
| Trash / Delete | `Trash` | `phosphor-svelte/lib/Trash` |
| Download | `DownloadSimple` | `phosphor-svelte/lib/DownloadSimple` |
| Upload | `UploadSimple` | `phosphor-svelte/lib/UploadSimple` |
| Copy | `Copy` | `phosphor-svelte/lib/Copy` |
| Check / Confirm | `Check` | `phosphor-svelte/lib/Check` |
| Warning | `Warning` | `phosphor-svelte/lib/Warning` |
| Info | `Info` | `phosphor-svelte/lib/Info` |

## Customizing Size

Control the icon size with the `size` prop. The default is `24`:

```svelte
<script>
  import Star from "phosphor-svelte/lib/Star";
</script>

<Star size={16} />  <!-- Small — tight UI, table cells, tags -->
<Star size={24} />  <!-- Default — body text, buttons -->
<Star size={32} />  <!-- Medium — section headers, cards -->
<Star size={48} />  <!-- Large — feature highlights, empty states -->
<Star size={64} />  <!-- Extra large — hero sections, error pages -->
```

### Size Guidelines for Consistent Design

Match icon sizes to your text hierarchy. Picking arbitrary sizes leads to a visually inconsistent interface:

| Context | Recommended size | Why |
|---------|-----------------|-----|
| Inline with body text (14-16px) | `16` or `18` | Matches the x-height of text |
| Buttons with text labels | `18` or `20` | Slightly larger than text for visual weight |
| Navigation links | `20` | Large enough to scan quickly |
| Card headings | `24` | Matches heading visual weight |
| Section headers | `28` - `32` | Draws attention without overwhelming |
| Empty state illustrations | `48` - `64` | Fills the visual void |
| Hero sections | `64` - `96` | Bold, attention-grabbing |

> **Rule of thumb:** Icon size should be roughly 1-1.3x the font-size of the accompanying text. A 64px icon next to 14px body text looks cartoonish. A 16px icon in an empty state page looks lost.

## Customizing Weight

Phosphor icons come in six visual weights. This is one of Phosphor's strongest features — most icon libraries give you one weight and you are stuck with it:

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

- `thin` — Very delicate, 1px stroke. Use for minimal, airy designs.
- `light` — Subtle and clean, 1.5px stroke. Good for secondary UI elements and content-heavy pages where icons should not dominate.
- `regular` — The default, balanced 2px stroke. Your workhorse weight.
- `bold` — Thicker, more prominent. Good for primary actions and emphasis.
- `fill` — Solid filled. Use for active/selected states (filled heart = liked, filled star = favorited).
- `duotone` — Two-tone with depth. A distinctive style for feature showcases, marketing pages, and empty states.

### Using Weight to Convey State

One of the most elegant patterns is using weight changes to show interactive state:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  import Star from "phosphor-svelte/lib/Star";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";

  let liked = $state(false);
  let starred = $state(false);
  let bookmarked = $state(false);
</script>

<button onclick={() => liked = !liked} aria-label={liked ? 'Unlike' : 'Like'}>
  <Heart
    size={24}
    weight={liked ? 'fill' : 'regular'}
    color={liked ? '#e74c3c' : 'currentColor'}
  />
</button>

<button onclick={() => starred = !starred} aria-label={starred ? 'Unstar' : 'Star'}>
  <Star
    size={24}
    weight={starred ? 'fill' : 'regular'}
    color={starred ? '#f1c40f' : 'currentColor'}
  />
</button>

<button onclick={() => bookmarked = !bookmarked} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}>
  <BookmarkSimple
    size={24}
    weight={bookmarked ? 'fill' : 'regular'}
    color={bookmarked ? '#3498db' : 'currentColor'}
  />
</button>

<style>
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: background 0.15s;
  }
  button:hover {
    background: rgba(0, 0, 0, 0.05);
  }
</style>
```

This pattern (regular → fill on activation) is used by every major social platform. Users intuitively understand that a filled icon means "active" or "selected."

### Consistency Rule: One Weight Per Context

Mixing weights randomly looks unprofessional. Establish rules for your project:

```svelte
<script>
  import House from "phosphor-svelte/lib/House";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import User from "phosphor-svelte/lib/User";
  import Gear from "phosphor-svelte/lib/Gear";
</script>

<!-- WRONG: Mixed weights with no logic -->
<nav>
  <a href="/"><House weight="bold" size={20} /></a>
  <a href="/search"><MagnifyingGlass weight="thin" size={20} /></a>
  <a href="/profile"><User weight="duotone" size={20} /></a>
  <a href="/settings"><Gear weight="regular" size={20} /></a>
</nav>

<!-- CORRECT: Consistent weight, active state uses fill -->
<nav>
  <a href="/"><House weight="regular" size={20} /></a>
  <a href="/search"><MagnifyingGlass weight="regular" size={20} /></a>
  <a href="/profile"><User weight="regular" size={20} /></a>
  <a href="/settings"><Gear weight="regular" size={20} /></a>
</nav>
```

## Customizing Color

Set the icon color with the `color` prop or inherit it from the parent's CSS `color`:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  import Warning from "phosphor-svelte/lib/Warning";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import XCircle from "phosphor-svelte/lib/XCircle";
  import Info from "phosphor-svelte/lib/Info";
</script>

<!-- Explicit color prop -->
<Heart color="#e74c3c" size={32} weight="fill" />
<Warning color="#f39c12" size={32} weight="fill" />
<CheckCircle color="#27ae60" size={32} weight="fill" />
<XCircle color="#e74c3c" size={32} weight="fill" />
<Info color="#3498db" size={32} weight="fill" />

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

### Color Inheritance: How It Works and Why It Matters

Phosphor icons use `currentColor` as their default fill. This is a CSS keyword that resolves to the element's computed `color` value. This means icons automatically match their surrounding text color:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
</script>

<!-- The icon inherits red from the parent -->
<p style="color: red;"><Heart size={20} /> This text and icon are both red.</p>

<!-- The icon inherits whatever color the .muted class sets -->
<p class="muted"><Heart size={20} /> Muted text, muted icon.</p>

<style>
  .muted { color: #999; }
</style>
```

Why is inheritance the preferred pattern? Because when you change your color palette — switching from light mode to dark mode, doing a brand refresh, or adjusting contrast — icons automatically update with the surrounding text. Hard-coded hex values in `color` props must be updated individually:

```svelte
<!-- WRONG: Hard-coded colors break in dark mode -->
<Heart color="#e74c3c" />
<!-- In dark mode, #e74c3c might have poor contrast against a dark background -->

<!-- CORRECT: Use CSS classes on the parent, icon inherits -->
<span class="text-danger">
  <Heart weight="fill" />
</span>

<style>
  .text-danger { color: #e74c3c; }

  /* When dark mode is added later, the icon adapts automatically */
  @media (prefers-color-scheme: dark) {
    .text-danger { color: #f87171; }
  }
</style>
```

### Building Alert Components with Color Inheritance

Here is a reusable alert component that relies on CSS color inheritance instead of hard-coded icon colors:

```svelte
<!-- src/lib/components/Alert.svelte -->
<script>
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import Warning from "phosphor-svelte/lib/Warning";
  import XCircle from "phosphor-svelte/lib/XCircle";
  import Info from "phosphor-svelte/lib/Info";
  import X from "phosphor-svelte/lib/X";

  let { type = 'info', message = '', dismissible = false, ondismiss } = $props();

  const config = {
    info:    { icon: Info,        className: 'alert--info' },
    success: { icon: CheckCircle, className: 'alert--success' },
    warning: { icon: Warning,     className: 'alert--warning' },
    error:   { icon: XCircle,     className: 'alert--error' }
  };

  let { icon: Icon, className } = $derived(config[type]);
</script>

<div class="alert {className}" role="alert">
  <Icon size={20} weight="fill" />
  <p class="alert-message">{message}</p>
  {#if dismissible}
    <button onclick={ondismiss} aria-label="Dismiss alert" class="alert-dismiss">
      <X size={16} />
    </button>
  {/if}
</div>

<style>
  .alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 8px;
    border-left: 4px solid;
    font-size: 0.95rem;
  }

  .alert-message { flex: 1; margin: 0; }

  .alert-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: inherit;
    opacity: 0.7;
  }
  .alert-dismiss:hover { opacity: 1; background: rgba(0, 0, 0, 0.1); }

  .alert--success { color: #27ae60; background: #eafaf1; border-color: #27ae60; }
  .alert--warning { color: #b7791f; background: #fef9e7; border-color: #f39c12; }
  .alert--error   { color: #c0392b; background: #fdedec; border-color: #e74c3c; }
  .alert--info    { color: #2471a3; background: #ebf5fb; border-color: #3498db; }
</style>
```

Notice how the icon component (`Icon`) is stored as a value in the config object and rendered dynamically with `<Icon />`. This is the "component as a value" pattern — one of Svelte's superpowers. Components are first-class values that you can pass around, store in objects, and render conditionally.

## Icons in Buttons

One of the most common use cases is putting icons inside buttons:

```svelte
<script>
  import Trash from "phosphor-svelte/lib/Trash";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import Plus from "phosphor-svelte/lib/Plus";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
</script>

<!-- Icon before text (describes the action) -->
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

<!-- Icon after text (indicates direction or consequence) -->
<button class="btn primary">
  Continue <ArrowRight size={18} />
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
    font-weight: 500;
    transition: filter 0.15s, transform 0.1s;
  }

  .btn:hover { filter: brightness(1.1); }
  .btn:active { transform: scale(0.98); }

  .primary   { background: #3498db; }
  .secondary { background: #8e44ad; }
  .danger    { background: #e74c3c; }
  .outline   { background: white; color: #333; border: 1px solid #ddd; }
</style>
```

The key styling trio for icon buttons: `display: inline-flex` (makes the button a flex container), `align-items: center` (vertically centers icon and text), and `gap` (adds consistent spacing without margin hacks).

Notice the convention: leading icons describe the action (plus = add, trash = delete), trailing icons indicate direction or consequence (arrow right = next step, external link = opens new tab).

### WRONG vs CORRECT: Button Alignment

```svelte
<!-- WRONG: Icon and text misaligned, no explicit flex layout -->
<button>
  <Plus size={18} /> Add Item
</button>
<!-- The icon floats above the text baseline. The space between
     icon and text depends on whitespace in the HTML. -->

<!-- CORRECT: Flexbox alignment with explicit gap -->
<button class="btn">
  <Plus size={18} /> Add Item
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
<!-- Icon and text are vertically centered. Gap is consistent. -->
```

### Button Sizing Consistency

When you have a row of buttons, keep icon sizes consistent:

```svelte
<script>
  import Plus from "phosphor-svelte/lib/Plus";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import Trash from "phosphor-svelte/lib/Trash";
</script>

<!-- WRONG: Mixed icon sizes look uneven -->
<div class="button-row">
  <button class="btn"><Plus size={16} /> Add</button>
  <button class="btn"><PencilSimple size={22} /> Edit</button>
  <button class="btn"><Trash size={18} /> Delete</button>
</div>

<!-- CORRECT: All icons use the same size -->
<div class="button-row">
  <button class="btn"><Plus size={18} /> Add</button>
  <button class="btn"><PencilSimple size={18} /> Edit</button>
  <button class="btn"><Trash size={18} /> Delete</button>
</div>

<style>
  .button-row { display: flex; gap: 8px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
</style>
```

## Building an Icon Navbar

Here is a practical navigation bar using Phosphor icons with active-state highlighting:

```svelte
<script>
  import House from "phosphor-svelte/lib/House";
  import User from "phosphor-svelte/lib/User";
  import Gear from "phosphor-svelte/lib/Gear";
  import Bell from "phosphor-svelte/lib/Bell";
  import SignOut from "phosphor-svelte/lib/SignOut";
  import { page } from '$app/state';
</script>

<nav class="navbar">
  <a href="/" class="nav-link" class:active={page.url.pathname === '/'}>
    <House size={20} weight={page.url.pathname === '/' ? 'fill' : 'regular'} /> Home
  </a>
  <a href="/profile" class="nav-link" class:active={page.url.pathname === '/profile'}>
    <User size={20} weight={page.url.pathname === '/profile' ? 'fill' : 'regular'} /> Profile
  </a>
  <a href="/settings" class="nav-link" class:active={page.url.pathname === '/settings'}>
    <Gear size={20} weight={page.url.pathname === '/settings' ? 'fill' : 'regular'} /> Settings
  </a>
  <a href="/notifications" class="nav-link" class:active={page.url.pathname === '/notifications'}>
    <Bell size={20} weight={page.url.pathname === '/notifications' ? 'fill' : 'regular'} /> Alerts
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
    transition: background 0.15s;
  }

  .nav-link:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .nav-link.active {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    font-weight: 600;
  }

  .logout {
    margin-left: auto;
    color: #e74c3c;
  }
</style>
```

Notice the pattern: active links get `weight="fill"` while inactive links use `weight="regular"`. Combined with the Svelte `class:active` directive, this creates a polished navigation with clear visual feedback.

### Extracting a Reusable NavLink Component

The repetition above calls for a component. This demonstrates passing icon components as props — a fundamental Svelte pattern:

```svelte
<!-- src/lib/components/NavLink.svelte -->
<script>
  import { page } from '$app/state';

  let { href, label, icon: Icon } = $props();
  let isActive = $derived(page.url.pathname === href);
</script>

<a {href} class="nav-link" class:active={isActive}
   aria-current={isActive ? 'page' : undefined}>
  <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
  {label}
</a>

<style>
  .nav-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    color: #ecf0f1;
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
    transition: background 0.15s;
  }

  .nav-link:hover { background: rgba(255, 255, 255, 0.1); }

  .nav-link.active {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    font-weight: 600;
  }
</style>
```

```svelte
<!-- Usage -->
<script>
  import NavLink from '$lib/components/NavLink.svelte';
  import House from "phosphor-svelte/lib/House";
  import User from "phosphor-svelte/lib/User";
  import Gear from "phosphor-svelte/lib/Gear";
  import Bell from "phosphor-svelte/lib/Bell";
</script>

<nav class="navbar">
  <NavLink href="/" label="Home" icon={House} />
  <NavLink href="/profile" label="Profile" icon={User} />
  <NavLink href="/settings" label="Settings" icon={Gear} />
  <NavLink href="/notifications" label="Alerts" icon={Bell} />
</nav>
```

Passing an icon component as a prop (`icon: Icon`) works because Svelte components are just values — you can pass them around like any other data. The prop receives the component constructor, and you render it with `<Icon />` in the template.

## Icon-Only Buttons and Accessibility

Sometimes you want buttons with just an icon and no text. This is common for toolbars, action rows, and compact UIs. But icon-only buttons are an accessibility trap if you do not handle them correctly.

A sighted user sees a trash can icon and knows it means "delete." A screen reader user hears nothing. Or worse, they hear the SVG path data read aloud. Without accessible text, icon-only buttons are invisible to assistive technology users.

### WRONG vs CORRECT: Icon Button Accessibility

```svelte
<!-- WRONG: No accessible label — screen reader says "button" with no context -->
<button>
  <Trash size={20} />
</button>

<!-- WRONG: aria-label on the icon, not the button -->
<button>
  <Trash size={20} aria-label="Delete" />
</button>
<!-- The SVG gets the label, but the button itself has no accessible name -->

<!-- CORRECT: aria-label on the button element -->
<button aria-label="Delete item">
  <Trash size={20} />
</button>

<!-- ALSO CORRECT: visually hidden text -->
<button>
  <Trash size={20} />
  <span class="sr-only">Delete item</span>
</button>
```

### A Complete Icon-Only Toolbar

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  import ShareNetwork from "phosphor-svelte/lib/ShareNetwork";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import DotsThree from "phosphor-svelte/lib/DotsThree";
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
  <button class="icon-btn" aria-label="More options">
    <DotsThree size={20} weight="bold" />
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
    transition: background 0.15s, color 0.15s;
  }

  .icon-btn:hover {
    background: #f0f0f0;
    color: #333;
  }

  .icon-btn:focus-visible {
    outline: 2px solid #3498db;
    outline-offset: 2px;
  }
</style>
```

The `:focus-visible` style ensures keyboard users can see which button is focused, while mouse users do not see an outline on click. This is the modern approach to focus styling.

### Dynamic Accessible Labels for Toggles

When an icon button toggles state, the `aria-label` should describe what clicking will do (the action), not the current state:

```svelte
<script>
  import Heart from "phosphor-svelte/lib/Heart";
  let liked = $state(false);
  let likeCount = $state(42);
</script>

<button
  onclick={() => { liked = !liked; likeCount += liked ? 1 : -1; }}
  aria-label={liked ? 'Unlike' : 'Like'}
  aria-pressed={liked}
  class="like-btn"
>
  <Heart
    size={20}
    weight={liked ? 'fill' : 'regular'}
    color={liked ? '#e74c3c' : 'currentColor'}
  />
  <span class="count">{likeCount}</span>
</button>

<style>
  .like-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid #ddd;
    border-radius: 20px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 0.9rem;
    color: #555;
  }

  .count {
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    text-align: center;
  }
</style>
```

The `aria-pressed` attribute tells screen readers this is a toggle button. `font-variant-numeric: tabular-nums` ensures the counter does not shift the button width when numbers change (monospaced digits prevent layout jitter).

## Building a Custom Icon Wrapper Component

In larger projects, create a centralized Icon component that standardizes sizing, color, and accessibility logic across your entire application:

```svelte
<!-- src/lib/components/Icon.svelte -->
<script>
  let {
    icon: IconComponent,
    size = 'md',
    weight = 'regular',
    color,
    label,
    class: className = ''
  } = $props();

  const sizes = {
    xs: 14,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
    '2xl': 48
  };

  let pixelSize = $derived(typeof size === 'number' ? size : sizes[size] ?? sizes.md);
</script>

<span
  class="icon {className}"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <IconComponent size={pixelSize} {weight} {color} />
</span>

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 0;
  }
</style>
```

Usage:

```svelte
<script>
  import Icon from '$lib/components/Icon.svelte';
  import House from 'phosphor-svelte/lib/House';
  import Heart from 'phosphor-svelte/lib/Heart';
</script>

<!-- Decorative icon (aria-hidden automatically) -->
<Icon icon={House} size="md" />

<!-- Informative icon (role="img" with label) -->
<Icon icon={Heart} size="lg" weight="fill" color="#e74c3c" label="Favorite" />
```

This wrapper centralizes several concerns: if you provide a `label`, it gets `role="img"` and `aria-label`; if you do not, it gets `aria-hidden="true"`. The named size scale (`xs`, `sm`, `md`, etc.) enforces design consistency — developers cannot use arbitrary pixel values.

### Creating an Icon Map for Dynamic Icon Rendering

Sometimes you need to render an icon dynamically based on data — for example, a sidebar where each menu item specifies its icon by name in a database or config file:

```svelte
<!-- src/lib/components/DynamicIcon.svelte -->
<script>
  import House from 'phosphor-svelte/lib/House';
  import User from 'phosphor-svelte/lib/User';
  import Gear from 'phosphor-svelte/lib/Gear';
  import Bell from 'phosphor-svelte/lib/Bell';
  import ChartBar from 'phosphor-svelte/lib/ChartBar';
  import Folder from 'phosphor-svelte/lib/Folder';

  const ICON_MAP = {
    house: House,
    user: User,
    gear: Gear,
    bell: Bell,
    chart: ChartBar,
    folder: Folder,
  };

  let { name, size = 24, weight = 'regular', color } = $props();

  let IconComponent = $derived(ICON_MAP[name]);
</script>

{#if IconComponent}
  <IconComponent {size} {weight} {color} />
{:else}
  <span class="icon-placeholder" style:width="{size}px" style:height="{size}px"></span>
{/if}

<style>
  .icon-placeholder {
    display: inline-block;
    background: #f0f0f0;
    border-radius: 4px;
  }
</style>
```

Usage with data-driven navigation:

```svelte
<script>
  import DynamicIcon from '$lib/components/DynamicIcon.svelte';

  const menuItems = [
    { icon: 'house', label: 'Home', href: '/' },
    { icon: 'chart', label: 'Analytics', href: '/analytics' },
    { icon: 'folder', label: 'Projects', href: '/projects' },
    { icon: 'gear', label: 'Settings', href: '/settings' },
  ];
</script>

<nav class="sidebar">
  {#each menuItems as item}
    <a href={item.href} class="menu-item">
      <DynamicIcon name={item.icon} size={20} />
      <span>{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  .sidebar { display: flex; flex-direction: column; gap: 4px; }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    text-decoration: none;
    color: #333;
    border-radius: 8px;
    transition: background 0.15s;
  }
  .menu-item:hover { background: #f5f5f5; }
</style>
```

> **Why not use lazy imports?** You might be tempted to use `import()` to dynamically load icons on demand. In practice, each icon is only around 500 bytes of SVG path data. The overhead of a dynamic import (new network request, module evaluation) is far more expensive than bundling 20-30 icons statically. Only consider dynamic imports if you have hundreds of icons that are rarely displayed, like an icon picker.

## Building a Design System Icon Barrel

For larger projects, create a centralized icon barrel that enforces consistency and makes icon swapping trivial:

```typescript
// src/lib/icons/index.ts
// Central registry of all icons used in this project.
// Adding an icon here means it is part of the design system.

// Navigation
export { default as IconHome } from 'phosphor-svelte/lib/House';
export { default as IconSearch } from 'phosphor-svelte/lib/MagnifyingGlass';
export { default as IconMenu } from 'phosphor-svelte/lib/List';
export { default as IconClose } from 'phosphor-svelte/lib/X';
export { default as IconBack } from 'phosphor-svelte/lib/ArrowLeft';

// Actions
export { default as IconAdd } from 'phosphor-svelte/lib/Plus';
export { default as IconEdit } from 'phosphor-svelte/lib/PencilSimple';
export { default as IconDelete } from 'phosphor-svelte/lib/Trash';
export { default as IconSave } from 'phosphor-svelte/lib/FloppyDisk';
export { default as IconDownload } from 'phosphor-svelte/lib/DownloadSimple';
export { default as IconUpload } from 'phosphor-svelte/lib/UploadSimple';
export { default as IconShare } from 'phosphor-svelte/lib/ShareNetwork';
export { default as IconCopy } from 'phosphor-svelte/lib/Copy';

// Status
export { default as IconSuccess } from 'phosphor-svelte/lib/CheckCircle';
export { default as IconWarning } from 'phosphor-svelte/lib/Warning';
export { default as IconError } from 'phosphor-svelte/lib/XCircle';
export { default as IconInfo } from 'phosphor-svelte/lib/Info';

// Social
export { default as IconLike } from 'phosphor-svelte/lib/Heart';
export { default as IconComment } from 'phosphor-svelte/lib/ChatCircle';
export { default as IconBookmark } from 'phosphor-svelte/lib/BookmarkSimple';

// User
export { default as IconUser } from 'phosphor-svelte/lib/User';
export { default as IconSettings } from 'phosphor-svelte/lib/Gear';
export { default as IconLogout } from 'phosphor-svelte/lib/SignOut';
export { default as IconNotification } from 'phosphor-svelte/lib/Bell';
```

Now components import from your own icon barrel:

```svelte
<script>
  import { IconAdd, IconEdit, IconDelete } from '$lib/icons';
</script>

<button class="btn"><IconAdd size={18} /> New</button>
<button class="btn"><IconEdit size={18} /> Edit</button>
<button class="btn"><IconDelete size={18} /> Remove</button>
```

**Benefits of this pattern:**
- **Consistent naming.** Every icon starts with `Icon` prefix. Autocomplete shows all available icons.
- **Controlled vocabulary.** New icons go through the design system review. No rogue icon imports scattered across the codebase.
- **Easy to swap.** Want to switch from Phosphor to Lucide? Change the imports in one file, not fifty.
- **Discoverable.** New team members can browse `$lib/icons/index.ts` to see every icon available in the project.

> **Important:** This barrel file does NOT have the same tree-shaking problem as the library's own barrel. Your barrel re-exports specific deep imports, so the bundler only includes the icons you actually use from this file. The problem with `import { Heart } from "phosphor-svelte"` is that the library's barrel re-exports all 7,000+ icons through a single entry point with potential side effects.

## Loading States with Icons

Icons communicate loading states effectively. Pair the SpinnerGap icon with a CSS animation:

```svelte
<script>
  import SpinnerGap from "phosphor-svelte/lib/SpinnerGap";
  import Check from "phosphor-svelte/lib/Check";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";

  let loading = $state(false);
  let success = $state(false);

  async function handleDownload() {
    loading = true;
    success = false;
    await new Promise(r => setTimeout(r, 2000));
    loading = false;
    success = true;
    setTimeout(() => success = false, 3000);
  }
</script>

<button onclick={handleDownload} disabled={loading} class="btn">
  {#if loading}
    <span class="spin"><SpinnerGap size={18} /></span>
    Downloading...
  {:else if success}
    <Check size={18} />
    Downloaded!
  {:else}
    <DownloadSimple size={18} />
    Download
  {/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .spin {
    display: inline-flex;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
```

Note: you cannot apply CSS classes directly to Phosphor components (they are Svelte components, not plain HTML elements). Wrap them in a `<span>` and animate the wrapper.

## Empty States with Duotone Icons

Empty states — when a list has no items, a search returns no results, or a user has no content — are one of the best places for large duotone icons:

```svelte
<script>
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import Package from "phosphor-svelte/lib/Package";
  import Plus from "phosphor-svelte/lib/Plus";
</script>

<div class="empty-state">
  <MagnifyingGlass size={64} weight="duotone" />
  <h2>No results found</h2>
  <p>Try adjusting your search terms or filters.</p>
</div>

<div class="empty-state">
  <Package size={64} weight="duotone" />
  <h2>No products yet</h2>
  <p>Add your first product to get started.</p>
  <button class="btn">
    <Plus size={18} /> Add Product
  </button>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px 32px;
    color: #999;
    text-align: center;
  }

  .empty-state h2 {
    margin-top: 16px;
    color: #555;
    font-size: 1.1rem;
  }

  .empty-state p {
    margin-top: 8px;
    font-size: 0.9rem;
  }

  .btn {
    margin-top: 24px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
```

The `duotone` weight works especially well at large sizes because the two-tone rendering gives the icon visual depth without being too heavy. A regular-weight icon at 64px looks like a wireframe outline; duotone fills the space elegantly.

## Icon Composition: Badges and Notification Indicators

Combine icons with badges for notification counts and status dots:

```svelte
<script>
  import Bell from "phosphor-svelte/lib/Bell";
  import ChatCircle from "phosphor-svelte/lib/ChatCircle";

  let notifications = $state(3);
  let messages = $state(12);
</script>

<div class="icon-group">
  <!-- Notification bell with count badge -->
  <button class="icon-btn-wrapper" aria-label="Notifications ({notifications} unread)">
    <Bell size={24} />
    {#if notifications > 0}
      <span class="badge">
        {notifications > 9 ? '9+' : notifications}
      </span>
    {/if}
  </button>

  <!-- Chat with dot indicator (no count) -->
  <button class="icon-btn-wrapper" aria-label="Messages ({messages} unread)">
    <ChatCircle size={24} />
    {#if messages > 0}
      <span class="dot"></span>
    {/if}
  </button>
</div>

<style>
  .icon-group { display: flex; gap: 16px; }

  .icon-btn-wrapper {
    position: relative;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    color: #333;
  }

  .badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 18px;
    height: 18px;
    background: #e74c3c;
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }

  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: #3498db;
    border-radius: 50%;
    border: 2px solid white;
  }
</style>
```

The `position: relative` on the parent and `position: absolute` on the badge is a standard CSS pattern for overlaying elements. The badge floats above the icon, slightly offset to the top-right corner.

## Performance Considerations

### Bundle Size Impact

Each Phosphor icon component adds roughly 500 bytes to 1.5KB to your bundle (minified + gzipped), depending on the icon's SVG complexity:

- **10 icons** — approximately 5-15KB gzipped. Negligible.
- **50 icons** — approximately 25-50KB gzipped. Acceptable for most apps.
- **200+ icons** — consider whether you actually need that many, or if a sprite sheet would serve better.

Compare this to icon fonts: Font Awesome's font file is around 150KB regardless of how many icons you use.

### Icons in Long Lists

If you render a list of 1,000 items with 3 icons each, that is 3,000 SVG component instances adding DOM nodes. In that scenario:

- Virtualize the list so only visible items are in the DOM
- Consider whether you need all three icons visible, or if some can be shown on hover
- Simpler weights (thin, light) have fewer SVG path nodes than complex weights (duotone)

For typical UI usage — a few icons per card in a list of 20-50 items — there is zero performance concern.

### Common Pitfall: Icons Shrinking in Flex Containers

```svelte
<!-- WRONG: icon shrinks when sibling text wraps -->
<div class="alert">
  <Warning size={24} />
  <p>This is a very long warning message that might wrap to multiple lines...</p>
</div>

<style>
  .alert { display: flex; align-items: flex-start; gap: 12px; }
</style>
```

The fix: add `flex-shrink: 0` to the icon or its wrapper:

```svelte
<!-- CORRECT: icon maintains its size -->
<div class="alert">
  <span class="icon-fixed"><Warning size={24} /></span>
  <p>This is a very long warning message that might wrap to multiple lines...</p>
</div>

<style>
  .alert { display: flex; align-items: flex-start; gap: 12px; }
  .icon-fixed { flex-shrink: 0; display: flex; }
</style>
```

SVGs in flex containers are treated as flex items and can be squeezed by the flex algorithm. `flex-shrink: 0` prevents this.

## Try It

Build a "Social Media Post" component with the following requirements:

1. **Post header:** An avatar area with a `User` icon (duotone, size 40) in a circular container, a username, and a timestamp. Add a `DotsThree` icon button for "more options" with `aria-label="Post options"`.

2. **Post content area:** A paragraph of text content and an image placeholder using a large duotone icon.

3. **Action bar:** Four icon buttons in a row:
   - Heart icon for "like" — toggles between `regular` and `fill` weight when clicked, changes color to red when liked, displays a like counter that increments/decrements. Use `aria-pressed` and a dynamic `aria-label`.
   - `ChatCircle` icon for "comment" — displays a static comment count
   - `ShareNetwork` icon for "share"
   - `BookmarkSimple` on the far right that toggles between `regular` and `fill` weight

4. **Navigation bar:** Above the post, add an icon navbar with at least four links using the `NavLink` component pattern — pass icon components as props and highlight the active link with `weight="fill"`.

5. **Empty state:** Below the post, add a "No more posts" empty state with a large duotone icon.

## Key Takeaways

- **Icon fonts are a legacy pattern.** They cannot tree-shake, they render as text (not vectors), and they create accessibility issues. Use SVG component libraries instead.
- Install Phosphor with `npm install phosphor-svelte`. Import individual icons from `"phosphor-svelte/lib/IconName"` — never from the package root, or you risk bundling all 7,000+ icons.
- Icons serve three roles: **decorative** (skip for screen readers), **informative** (needs context), and **interactive** (needs `aria-label` on the button). Know which role each icon plays.
- Customize icons with `size`, `weight`, and `color` props. Six weights available: thin, light, regular, bold, fill, and duotone.
- Use `weight="fill"` for active/selected states and `weight="regular"` for default states — this is the industry-standard toggle pattern.
- Icons use `currentColor` by default, so they inherit their parent's CSS `color`. Use this for theming instead of hard-coding colors.
- Use `display: inline-flex`, `align-items: center`, and `gap` to align icons in buttons. Never use margin or vertical-align hacks.
- Always add `aria-label` to icon-only buttons. Use `aria-pressed` for toggle buttons. Update labels dynamically when state changes.
- Pass icon components as props to create reusable patterns like `NavLink` — components are first-class values in Svelte.
- Build a `$lib/icons/index.ts` barrel for design system consistency — it controls the icon vocabulary and makes swapping libraries trivial.
- Apply `flex-shrink: 0` to icons in flex containers to prevent them from being squeezed when siblings overflow.
- To animate icons, wrap them in a `<span>` and animate the wrapper — you cannot apply CSS classes directly to Phosphor components.
- Keep icon sizes consistent within the same context (all nav icons at 20px, all button icons at 18px) for professional visual rhythm.
- Browse all icons at [phosphoricons.com](https://phosphoricons.com)
