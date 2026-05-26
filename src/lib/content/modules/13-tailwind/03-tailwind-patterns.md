# Tailwind Patterns

Now that Tailwind is installed and configured, let's build real UI patterns. This lesson covers the components you will build most often — buttons, cards, inputs, badges, alerts, modals, and navigation bars — and teaches you when to reach for Tailwind versus Svelte's scoped CSS.

Understanding these patterns and knowing when to use each styling approach will make you a more effective developer. We will build a complete, production-quality UI kit with variant systems, conditional classes, dark mode support, responsive design, and Tailwind animations.

## Conditional Classes: The Foundation

Before building components, you need to know how to apply classes conditionally. There are three patterns you will use constantly.

### Template literals

The simplest approach — good for one or two conditions:

```svelte
<script lang="ts">
  let { active = false }: { active: boolean } = $props();
</script>

<div class="rounded-lg p-4 {active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}">
  Content
</div>
```

### The clsx library

For components with many conditional classes, `clsx` (or its smaller alternative `clsx/lite`) keeps things readable:

```bash
npm install clsx
```

```svelte
<script lang="ts">
  import clsx from 'clsx';

  interface Props {
    variant: "primary" | "secondary" | "ghost";
    size: "sm" | "md" | "lg";
    disabled?: boolean;
    fullWidth?: boolean;
  }

  let { variant, size, disabled = false, fullWidth = false }: Props = $props();

  let classes = $derived(clsx(
    // Base classes — always applied
    "inline-flex items-center justify-center font-medium rounded-lg transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",

    // Variant classes — one active at a time
    variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
    variant === "secondary" && "bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:ring-gray-400",
    variant === "ghost" && "bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",

    // Size classes
    size === "sm" && "text-sm px-3 py-1.5",
    size === "md" && "text-base px-4 py-2",
    size === "lg" && "text-lg px-6 py-3",

    // Boolean modifiers
    disabled && "opacity-50 cursor-not-allowed",
    fullWidth && "w-full"
  ));
</script>

<button class={classes} {disabled}>
  <slot />
</button>
```

`clsx` accepts strings, objects, arrays, and falsy values. Falsy values (`false`, `null`, `undefined`, `0`, `""`) are ignored. This means `condition && "class-name"` works perfectly — when the condition is false, the expression evaluates to `false`, and `clsx` ignores it.

### Object map pattern

For variant systems with many options, map variant values to class strings:

```svelte
<script lang="ts">
  const variantClasses: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700"
  };

  const sizeClasses: Record<string, string> = {
    sm: "text-sm px-3 py-1.5 gap-1.5",
    md: "text-base px-4 py-2 gap-2",
    lg: "text-lg px-6 py-3 gap-2.5"
  };
</script>
```

This pattern scales better than long ternary chains and is easy to extend.

## Passing className as a Prop

Components need to accept external classes so consumers can adjust spacing, width, or other one-off styles:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import clsx from 'clsx';

  interface Props {
    class?: string;
    padding?: "none" | "sm" | "md" | "lg";
    children: Snippet;
  }

  let { class: className, padding = "md", children }: Props = $props();

  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-6",
    lg: "p-8"
  };
</script>

<div class={clsx(
  "rounded-xl bg-white shadow-sm border border-gray-200",
  paddingClasses[padding],
  className
)}>
  {@render children()}
</div>
```

Usage:

```svelte
<!-- Consumer can add margin, width, or any other utility -->
<Card class="mt-6 max-w-lg mx-auto">
  <p>Content with custom spacing</p>
</Card>
```

Note the prop is named `class` with the destructuring alias `className` — because `class` is a reserved word in JavaScript, you cannot use it directly as a variable name.

## Building a Complete Button Component

A production button handles variants, sizes, loading states, icons, and HTML attribute forwarding:

```svelte
<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import clsx from 'clsx';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    iconLeft?: Snippet;
    iconRight?: Snippet;
    children: Snippet;
    class?: string;
  }

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    children,
    class: className,
    disabled,
    ...restProps
  }: Props = $props();

  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]";

  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 shadow-sm",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",
    danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm",
    outline: "border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400"
  };

  const sizes: Record<string, string> = {
    sm: "text-sm px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-base px-6 py-2.5 gap-2.5"
  };

  let classes = $derived(clsx(
    base,
    variants[variant],
    sizes[size],
    (disabled || loading) && "opacity-50 cursor-not-allowed pointer-events-none",
    className
  ));
</script>

<button
  class={classes}
  disabled={disabled || loading}
  aria-busy={loading}
  {...restProps}
>
  {#if loading}
    <svg class="animate-spin -ml-0.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
  {:else if iconLeft}
    {@render iconLeft()}
  {/if}

  {@render children()}

  {#if iconRight && !loading}
    {@render iconRight()}
  {/if}
</button>
```

Usage:

```svelte
<Button variant="primary" size="md" onclick={save} loading={isSaving}>
  Save Changes
</Button>

<Button variant="outline" size="sm">
  {#snippet iconLeft()}
    <svg class="w-4 h-4"><!-- icon SVG --></svg>
  {/snippet}
  Download
</Button>

<Button variant="danger" onclick={handleDelete}>
  Delete Account
</Button>
```

## Building an Input Component

Inputs need labels, error states, help text, and accessible attributes:

```svelte
<!-- src/lib/components/Input.svelte -->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import clsx from 'clsx';

  interface Props extends HTMLInputAttributes {
    label?: string;
    error?: string;
    helpText?: string;
    class?: string;
  }

  let {
    label,
    error,
    helpText,
    class: className,
    id,
    ...restProps
  }: Props = $props();

  // Generate a stable ID for label association
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;
</script>

<div class={clsx("flex flex-col gap-1.5", className)}>
  {#if label}
    <label for={inputId} class="text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      {#if restProps.required}
        <span class="text-red-500 ml-0.5" aria-hidden="true">*</span>
      {/if}
    </label>
  {/if}

  <input
    id={inputId}
    class={clsx(
      "block w-full rounded-lg border px-3 py-2 text-sm transition-colors",
      "placeholder:text-gray-400",
      "focus:outline-none focus:ring-2 focus:ring-offset-0",
      error
        ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-200 bg-red-50"
        : "border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-200 bg-white",
      "dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
    )}
    aria-invalid={error ? "true" : undefined}
    aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
    {...restProps}
  />

  {#if error}
    <p id="{inputId}-error" class="text-sm text-red-600 dark:text-red-400" role="alert">
      {error}
    </p>
  {:else if helpText}
    <p id="{inputId}-help" class="text-sm text-gray-500 dark:text-gray-400">
      {helpText}
    </p>
  {/if}
</div>
```

Usage:

```svelte
<Input
  label="Email Address"
  type="email"
  placeholder="you@example.com"
  required
  error={errors.email}
  helpText="We'll never share your email."
/>

<Input
  label="Password"
  type="password"
  placeholder="At least 8 characters"
  error={errors.password}
/>
```

## Building a Card Component

Cards are the most common container pattern. Support images, headers, footers, and link behavior:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import clsx from 'clsx';

  interface Props {
    href?: string;
    imageUrl?: string;
    imageAlt?: string;
    variant?: "default" | "elevated" | "outlined" | "filled";
    class?: string;
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }

  let {
    href,
    imageUrl,
    imageAlt = "",
    variant = "default",
    class: className,
    header,
    footer,
    children
  }: Props = $props();

  const variantClasses: Record<string, string> = {
    default: "bg-white border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700",
    elevated: "bg-white shadow-lg dark:bg-gray-800",
    outlined: "bg-transparent border-2 border-gray-300 dark:border-gray-600",
    filled: "bg-gray-50 dark:bg-gray-800/50"
  };

  let wrapperClasses = $derived(clsx(
    "rounded-xl overflow-hidden transition-all duration-200",
    variantClasses[variant],
    href && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer group",
    className
  ));
</script>

{#if href}
  <a {href} class={wrapperClasses}>
    {#if imageUrl}
      <img src={imageUrl} alt={imageAlt} class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" />
    {/if}
    {#if header}
      <div class="px-6 pt-5 pb-0">
        {@render header()}
      </div>
    {/if}
    <div class="p-6">
      {@render children()}
    </div>
    {#if footer}
      <div class="px-6 pb-5 pt-0 border-t border-gray-100 dark:border-gray-700">
        {@render footer()}
      </div>
    {/if}
  </a>
{:else}
  <div class={wrapperClasses}>
    {#if imageUrl}
      <img src={imageUrl} alt={imageAlt} class="w-full h-48 object-cover" />
    {/if}
    {#if header}
      <div class="px-6 pt-5 pb-0">
        {@render header()}
      </div>
    {/if}
    <div class="p-6">
      {@render children()}
    </div>
    {#if footer}
      <div class="px-6 pb-5 pt-0 border-t border-gray-100 dark:border-gray-700">
        {@render footer()}
      </div>
    {/if}
  </div>
{/if}
```

Usage:

```svelte
<!-- Simple card -->
<Card>
  <h3 class="text-lg font-semibold mb-2">Simple Card</h3>
  <p class="text-gray-600">Basic content card.</p>
</Card>

<!-- Card with image and link -->
<Card href="/blog/my-post" imageUrl="/images/cover.jpg" imageAlt="Blog cover" variant="elevated">
  <h3 class="text-lg font-semibold mb-2">Blog Post Title</h3>
  <p class="text-gray-600 text-sm">A short excerpt from the blog post...</p>
</Card>

<!-- Card with header and footer -->
<Card variant="outlined">
  {#snippet header()}
    <div class="flex items-center gap-3">
      <img src="/avatar.jpg" alt="Author" class="w-8 h-8 rounded-full" />
      <span class="text-sm font-medium">Alice Johnson</span>
    </div>
  {/snippet}

  <p>The main content of the card goes here.</p>

  {#snippet footer()}
    <div class="flex items-center justify-between pt-4">
      <span class="text-sm text-gray-500">5 min read</span>
      <span class="text-sm text-blue-600">Read more</span>
    </div>
  {/snippet}
</Card>
```

## Building a Badge Component

Badges are small labels for status, counts, or categories:

```svelte
<!-- src/lib/components/Badge.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import clsx from 'clsx';

  interface Props {
    variant?: "default" | "primary" | "success" | "warning" | "error" | "info";
    size?: "sm" | "md";
    dot?: boolean;
    removable?: boolean;
    onremove?: () => void;
    children: Snippet;
    class?: string;
  }

  let {
    variant = "default",
    size = "md",
    dot = false,
    removable = false,
    onremove,
    children,
    class: className
  }: Props = $props();

  const variants: Record<string, string> = {
    default: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    primary: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400"
  };

  const dotColors: Record<string, string> = {
    default: "bg-gray-500",
    primary: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
    info: "bg-cyan-500"
  };

  const sizes: Record<string, string> = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-0.5"
  };
</script>

<span class={clsx(
  "inline-flex items-center gap-1.5 rounded-full font-medium",
  variants[variant],
  sizes[size],
  className
)}>
  {#if dot}
    <span class="h-1.5 w-1.5 rounded-full {dotColors[variant]}" aria-hidden="true"></span>
  {/if}

  {@render children()}

  {#if removable}
    <button
      onclick={(e) => { e.stopPropagation(); onremove?.(); }}
      class="ml-0.5 -mr-1 h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      aria-label="Remove"
    >
      <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
        <path d="M3.172 3.172a.5.5 0 01.707 0L6 5.293l2.121-2.121a.5.5 0 11.707.707L6.707 6l2.121 2.121a.5.5 0 01-.707.707L6 6.707 3.879 8.828a.5.5 0 01-.707-.707L5.293 6 3.172 3.879a.5.5 0 010-.707z"/>
      </svg>
    </button>
  {/if}
</span>
```

Usage:

```svelte
<Badge variant="success" dot>Active</Badge>
<Badge variant="warning">Pending Review</Badge>
<Badge variant="error" removable onremove={() => removeTag("svelte")}>svelte</Badge>
<Badge variant="primary" size="sm">New</Badge>
```

## Building an Alert Component

Alerts provide contextual feedback messages:

```svelte
<!-- src/lib/components/Alert.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import clsx from 'clsx';

  interface Props {
    variant?: "info" | "success" | "warning" | "error";
    title?: string;
    dismissible?: boolean;
    ondismiss?: () => void;
    icon?: Snippet;
    children: Snippet;
    class?: string;
  }

  let {
    variant = "info",
    title,
    dismissible = false,
    ondismiss,
    icon,
    children,
    class: className
  }: Props = $props();

  let visible = $state(true);

  const variants: Record<string, { wrapper: string; icon: string; title: string }> = {
    info: {
      wrapper: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
      icon: "text-blue-600 dark:text-blue-400",
      title: "text-blue-800 dark:text-blue-300"
    },
    success: {
      wrapper: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
      icon: "text-green-600 dark:text-green-400",
      title: "text-green-800 dark:text-green-300"
    },
    warning: {
      wrapper: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800",
      icon: "text-yellow-600 dark:text-yellow-400",
      title: "text-yellow-800 dark:text-yellow-300"
    },
    error: {
      wrapper: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
      icon: "text-red-600 dark:text-red-400",
      title: "text-red-800 dark:text-red-300"
    }
  };

  function dismiss() {
    visible = false;
    ondismiss?.();
  }
</script>

{#if visible}
  <div
    class={clsx(
      "rounded-lg border p-4",
      variants[variant].wrapper,
      className
    )}
    role="alert"
  >
    <div class="flex gap-3">
      {#if icon}
        <div class="flex-shrink-0 {variants[variant].icon}">
          {@render icon()}
        </div>
      {/if}

      <div class="flex-1 min-w-0">
        {#if title}
          <h3 class="text-sm font-semibold {variants[variant].title} mb-1">
            {title}
          </h3>
        {/if}
        <div class="text-sm text-gray-700 dark:text-gray-300">
          {@render children()}
        </div>
      </div>

      {#if dismissible}
        <button
          onclick={dismiss}
          class="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Dismiss"
        >
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>
{/if}
```

## Building a Modal Component

Modals need focus trapping, backdrop click handling, keyboard dismissal, and scroll locking:

```svelte
<!-- src/lib/components/Modal.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import clsx from 'clsx';

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
    size?: "sm" | "md" | "lg" | "xl" | "full";
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;
    class?: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
  }

  let {
    open,
    onclose,
    title,
    size = "md",
    header,
    footer,
    children,
    class: className,
    closeOnBackdrop = true,
    closeOnEscape = true
  }: Props = $props();

  const sizes: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]"
  };

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && closeOnEscape) {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onclose();
    }
  }

  // Lock body scroll when modal is open
  $effect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    onkeydown={handleKeyDown}
  >
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
      onclick={handleBackdropClick}
    ></div>

    <!-- Modal panel -->
    <div
      class={clsx(
        "relative w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl",
        "animate-scale-in",
        sizes[size],
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        {#if header}
          {@render header()}
        {:else if title}
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {/if}
        <button
          onclick={onclose}
          class="p-2 -m-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close"
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 overflow-y-auto max-h-[60vh]">
        {@render children()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scale-in {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .animate-fade-in {
    animation: fade-in 0.15s ease-out;
  }

  .animate-scale-in {
    animation: scale-in 0.2s ease-out;
  }
</style>
```

Usage:

```svelte
<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/Button.svelte';

  let showModal = $state(false);
</script>

<Button onclick={() => showModal = true}>Open Modal</Button>

<Modal open={showModal} onclose={() => showModal = false} title="Confirm Action" size="md">
  <p class="text-gray-600">Are you sure you want to proceed? This action cannot be undone.</p>

  {#snippet footer()}
    <Button variant="ghost" onclick={() => showModal = false}>Cancel</Button>
    <Button variant="danger" onclick={handleConfirm}>Delete</Button>
  {/snippet}
</Modal>
```

## Building a Responsive Navbar

A responsive navbar with mobile hamburger menu:

```svelte
<!-- src/lib/components/Navbar.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import clsx from 'clsx';

  interface NavLink {
    href: string;
    label: string;
  }

  interface Props {
    brand?: string;
    links?: NavLink[];
  }

  let { brand = "MySite", links = [] }: Props = $props();

  let mobileMenuOpen = $state(false);

  function toggleMobile() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  // Close mobile menu on navigation
  $effect(() => {
    $page.url.pathname;
    mobileMenuOpen = false;
  });
</script>

<nav class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
  <div class="max-w-6xl mx-auto px-4 sm:px-6">
    <div class="flex items-center justify-between h-16">
      <!-- Brand -->
      <a href="/" class="text-xl font-bold text-gray-900 dark:text-white">
        {brand}
      </a>

      <!-- Desktop links -->
      <div class="hidden md:flex items-center gap-1">
        {#each links as link}
          <a
            href={link.href}
            class={clsx(
              "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              $page.url.pathname === link.href
                ? "bg-gray-100 text-blue-600 dark:bg-gray-800 dark:text-blue-400"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800"
            )}
            aria-current={$page.url.pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </a>
        {/each}
      </div>

      <!-- Mobile menu button -->
      <button
        class="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        onclick={toggleMobile}
        aria-expanded={mobileMenuOpen}
        aria-label="Toggle navigation menu"
      >
        {#if mobileMenuOpen}
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        {:else}
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Mobile menu -->
  {#if mobileMenuOpen}
    <div class="md:hidden border-t border-gray-200 dark:border-gray-800 px-4 py-3 space-y-1">
      {#each links as link}
        <a
          href={link.href}
          class={clsx(
            "block px-3 py-2 rounded-lg text-base font-medium transition-colors",
            $page.url.pathname === link.href
              ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
              : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
          )}
        >
          {link.label}
        </a>
      {/each}
    </div>
  {/if}
</nav>
```

## Responsive Component Variants

Design components that adapt across breakpoints using Tailwind's responsive prefixes:

```svelte
<!-- A stats grid that stacks on mobile, goes 2-column on tablet, 4-column on desktop -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {#each stats as stat}
    <div class="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
      <p class="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
      <p class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
    </div>
  {/each}
</div>
```

For components that fundamentally change layout at different sizes, use separate markup blocks rather than fighting with responsive utilities:

```svelte
<!-- Mobile: vertical card layout -->
<div class="sm:hidden">
  <img src={imageUrl} alt={title} class="w-full h-48 object-cover rounded-t-xl" />
  <div class="p-4">
    <h3 class="font-semibold">{title}</h3>
    <p class="text-sm text-gray-600 mt-1">{description}</p>
  </div>
</div>

<!-- Desktop: horizontal card layout -->
<div class="hidden sm:flex gap-6 items-center">
  <img src={imageUrl} alt={title} class="w-48 h-32 object-cover rounded-xl flex-shrink-0" />
  <div>
    <h3 class="text-lg font-semibold">{title}</h3>
    <p class="text-gray-600 mt-2">{description}</p>
  </div>
</div>
```

## Dark Mode Patterns

Design every component with both modes in mind. The key rules for dark mode:

1. Background: white becomes gray-800 or gray-900
2. Text: gray-900 becomes white or gray-100
3. Muted text: gray-600 becomes gray-400
4. Borders: gray-200 becomes gray-700
5. Shadows: reduce or darken them (shadows are less visible on dark backgrounds)
6. Interactive elements: adjust hover states (hover:bg-gray-100 becomes dark:hover:bg-gray-700)

```svelte
<div class="
  bg-white dark:bg-gray-800
  border border-gray-200 dark:border-gray-700
  rounded-xl p-6
  shadow-sm dark:shadow-none
">
  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Title</h3>
  <p class="mt-2 text-gray-600 dark:text-gray-400">Description text</p>
  <button class="
    mt-4 px-4 py-2 rounded-lg text-sm font-medium
    bg-blue-600 text-white hover:bg-blue-700
    dark:bg-blue-500 dark:hover:bg-blue-400
  ">
    Action
  </button>
</div>
```

## Animation with Tailwind

Tailwind includes utilities for CSS transitions and animations. Use them for micro-interactions:

### Transitions

```svelte
<!-- Smooth hover effect -->
<button class="bg-blue-600 text-white px-4 py-2 rounded-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0">
  Hover me
</button>

<!-- Transition specific properties -->
<div class="transition-colors duration-300 bg-gray-100 hover:bg-blue-100">
  Color transition only
</div>

<div class="transition-transform duration-300 hover:scale-105">
  Scale on hover
</div>
```

### Built-in animations

```svelte
<!-- Spin — loading spinners -->
<svg class="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">...</svg>

<!-- Pulse — skeleton loading -->
<div class="animate-pulse space-y-3">
  <div class="h-4 bg-gray-200 rounded w-3/4"></div>
  <div class="h-4 bg-gray-200 rounded w-1/2"></div>
  <div class="h-4 bg-gray-200 rounded w-5/6"></div>
</div>

<!-- Bounce — attention-drawing -->
<div class="animate-bounce">
  <svg class="w-6 h-6"><!-- down arrow --></svg>
</div>

<!-- Ping — notification indicator -->
<span class="relative flex h-3 w-3">
  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
  <span class="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
</span>
```

### Custom animations with @theme

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --animate-slide-up: slide-up 0.3s ease-out;
  --animate-slide-down: slide-down 0.3s ease-out;
  --animate-fade-in: fade-in 0.2s ease-out;
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-down {
  from { opacity: 0; transform: translateY(-16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

```svelte
<div class="animate-slide-up">This slides up on render</div>
```

## When to Use Tailwind vs Scoped CSS

Both approaches work well in SvelteKit. Here is a guideline:

**Use Tailwind when:**
- Building common UI patterns (cards, buttons, grids, layouts)
- You want rapid prototyping and consistent spacing/colors
- The styles are mostly utility-driven with no complex selectors
- The component is primarily about layout and visual styling

**Use Svelte scoped CSS when:**
- You need complex CSS (multi-step animations, pseudo-elements, `::before`/`::after`)
- The component has many state-dependent styles that would clutter the markup
- You need CSS features Tailwind does not expose (container queries, complex selectors)
- You are overriding third-party component styles

```svelte
<!-- Mixing both approaches works great -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-8">
  <div class="card">
    <h3 class="text-lg font-semibold text-gray-900">Scoped styles for complex parts</h3>
    <p class="text-gray-600 mt-2">Tailwind for simple utilities</p>
  </div>
</div>

<style>
  .card {
    position: relative;
    overflow: hidden;
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, #ff3e00, #6c5ce7);
  }
  .card::after {
    content: '';
    position: absolute;
    bottom: -50%;
    right: -50%;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.05), transparent 70%);
    pointer-events: none;
  }
</style>
```

## Try It

Build a complete project showcase page that uses all the components from this lesson:

1. A `Navbar` with brand name and navigation links. Active link should be highlighted. Include a mobile hamburger menu.

2. A hero section with a heading, description, and two `Button` components (primary and outline variants).

3. A grid of `Card` components showing projects. Each card should have an image, title, description, and a row of `Badge` components for tags.

4. An `Alert` component at the top of the page showing a success or info message, dismissible.

5. A `Modal` triggered by a "Contact" button, containing a form with `Input` components and a submit button.

6. Add dark mode support to every component using `dark:` variants.

7. Add responsive design: the project grid should be 1 column on mobile, 2 on tablet, 3 on desktop.

## Key Takeaways

- Use `clsx` for readable conditional class logic — falsy values are automatically removed
- Pass `class` as a prop (aliased to `className`) so consumers can customize component spacing and layout
- Build variant systems by mapping prop values to class strings in a `Record<string, string>` object
- Extend `HTMLButtonAttributes` / `HTMLInputAttributes` to forward native HTML attributes with rest props
- The `group` and `group-hover:` pattern triggers child hover effects from a parent element
- Use `dark:` variants on every component — plan for both themes from the start
- Use Tailwind's `transition-*` and `animate-*` utilities for micro-interactions
- Define custom animations in `@theme` and `@keyframes` in your `app.css`
- Extract Svelte components (not `@apply` classes) for reusable UI patterns
- Mix Tailwind and scoped CSS freely — use each where it is strongest
- Responsive prefixes (`sm:`, `md:`, `lg:`) go directly on utility classes for adaptive layouts
