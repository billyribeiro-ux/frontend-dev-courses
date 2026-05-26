# Layouts, Auth Pages & Error Handling

TeamBoard has two distinct sections: public pages (login, signup, marketing) and the authenticated app (dashboard, boards, settings). Layout groups let you give each section its own layout without nesting one inside the other. This lesson builds the layout system, authentication pages, View Transitions, and custom error pages.

Understanding layouts at a deep level is critical because layout architecture is one of the first decisions that shapes your entire application. Get it wrong and you end up fighting the framework — wrapping pages in conditional `{#if}` blocks, duplicating navigation components, and creating brittle auth checks scattered across pages. Get it right and the framework works for you — every new page automatically inherits the correct layout, auth protection, and error handling.

## Layout Groups: The Mental Model

The key insight behind layout groups is that **URL structure and layout structure are independent concerns.** You might want `/login` and `/dashboard` at the same URL depth, but with completely different visual shells. Without layout groups, SvelteKit would nest them under the same layout or force you to use awkward workarounds.

Layout groups solve this with parentheses in directory names. The parenthesized name is stripped from the URL but still creates a layout boundary:

```
src/routes/
├── (auth)/
│   ├── +layout.svelte      ← minimal centered layout
│   ├── login/+page.svelte   ← URL: /login (not /auth/login)
│   └── signup/+page.svelte  ← URL: /signup (not /auth/signup)
├── (app)/
│   ├── +layout.svelte      ← full app shell with sidebar
│   ├── +layout.server.ts   ← auth guard (protects ALL routes in this group)
│   ├── dashboard/+page.svelte  ← URL: /dashboard
│   └── [teamSlug]/
│       ├── +page.svelte        ← URL: /acme-corp
│       └── boards/
│           └── +page.svelte    ← URL: /acme-corp/boards
├── (marketing)/
│   ├── +layout.svelte      ← marketing layout with CTA header
│   ├── pricing/+page.svelte ← URL: /pricing
│   └── features/+page.svelte ← URL: /features
├── +layout.svelte           ← root layout (shared by ALL groups)
├── +error.svelte            ← root error page
└── +page.svelte             ← marketing landing page (no group)
```

The parentheses in `(auth)`, `(app)`, and `(marketing)` tell SvelteKit these are layout groups — they create layout boundaries without adding path segments. The URL `/login` maps to `(auth)/login/+page.svelte`, and `/dashboard` maps to `(app)/dashboard/+page.svelte`. The user never sees "auth" or "app" in their browser URL.

### Layout Hierarchy

Understanding how layouts nest is critical for debugging:

```
Root Layout (+layout.svelte)
├── (auth) Layout (+layout.svelte)
│   └── Page content (login, signup)
├── (app) Layout (+layout.svelte)
│   └── Page content (dashboard, boards)
├── (marketing) Layout (+layout.svelte)
│   └── Page content (pricing, features)
└── Root page (no group layout, just root layout)
```

Every page renders inside its group layout, which renders inside the root layout. The root layout always wraps everything — it is the outermost shell. This is where you put things that are truly global: View Transitions, analytics scripts, global styles, `<meta>` tags.

### WRONG vs CORRECT: Layout Architecture

```
WRONG: Using conditional rendering instead of layout groups
──────────────────────────────────────────────────────────
src/routes/
├── +layout.svelte  ← one layout with {#if isAuthenticated} ... {:else} ...
├── login/+page.svelte
├── dashboard/+page.svelte
└── settings/+page.svelte

Problem: The layout component grows into a monster of conditional logic.
Every new page type adds another branch. Auth checks are scattered.
The sidebar component re-mounts on every navigation even when it shouldn't.

CORRECT: Using layout groups
──────────────────────────────────────────────────────────
src/routes/
├── (auth)/+layout.svelte       ← clean, focused, minimal
├── (app)/+layout.svelte        ← clean, focused, with sidebar
├── (marketing)/+layout.svelte  ← clean, focused, with CTA
└── +layout.svelte              ← root: only truly global concerns

Each layout is simple and single-purpose. No conditionals.
```

## Root Layout with View Transitions

The root layout wraps everything. It sets up View Transitions so page navigations animate smoothly:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css';
  import { onNavigate } from '$app/navigation';

  let { children } = $props();

  onNavigate((navigation) => {
    // Skip if the browser does not support View Transitions
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#4f46e5" />
</svelte:head>

{@render children()}
```

### How View Transitions Work

`onNavigate` fires for every client-side navigation. By returning a promise that resolves inside `startViewTransition`, the old page snapshot crossfades into the new page. Here is the sequence:

```
1. User clicks a link
2. onNavigate fires BEFORE navigation starts
3. startViewTransition captures a screenshot of the current page
4. resolve() tells SvelteKit to proceed with the navigation
5. SvelteKit swaps the DOM (new page renders)
6. navigation.complete resolves when the new page is ready
7. The browser crossfades from the screenshot to the new DOM
```

This works for all navigations across the app — between auth pages and app pages alike. The entire transition is CSS-driven, so it is smooth and performant.

**Important:** `onNavigate` only fires for client-side navigations. Full-page loads (direct URL entry, hard refresh) do not trigger it. This is correct behavior — you only want the crossfade animation between pages the user is clicking between.

Add the CSS for the view transition:

```css
/* src/app.css */
@keyframes fade-in {
  from { opacity: 0; }
}
@keyframes fade-out {
  to { opacity: 0; }
}

::view-transition-old(root) {
  animation: 150ms ease-out fade-out;
}
::view-transition-new(root) {
  animation: 150ms ease-in fade-in;
}
```

### Customizing Transitions Per Element

You can give specific elements their own transition names for more sophisticated animations:

```svelte
<!-- The sidebar stays in place while content crossfades -->
<aside style="view-transition-name: sidebar;">
  <!-- Sidebar content -->
</aside>

<main style="view-transition-name: content;">
  {@render children()}
</main>
```

```css
/* Sidebar does not animate (it persists across navigations) */
::view-transition-old(sidebar),
::view-transition-new(sidebar) {
  animation: none;
}

/* Content area crossfades */
::view-transition-old(content) {
  animation: 150ms ease-out fade-out;
}
::view-transition-new(content) {
  animation: 200ms ease-in fade-in;
}
```

This creates a more polished experience: the sidebar stays rock-solid while only the main content area transitions. Users perceive this as faster because the stable sidebar provides a visual anchor.

## Auth Layout (Centered, Minimal)

The auth layout is a simple centered card — no sidebar, no header. Its only job is to center the login/signup form:

```svelte
<!-- src/routes/(auth)/+layout.svelte -->
<script lang="ts">
  import { PUBLIC_APP_NAME } from '$env/static/public';

  let { children } = $props();
</script>

<svelte:head>
  <title>{PUBLIC_APP_NAME}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
  <div class="w-full max-w-md">
    <!-- App logo/name — links back to the marketing landing page -->
    <a href="/" class="block text-center mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {PUBLIC_APP_NAME}
      </h1>
    </a>
    {@render children()}
  </div>
</div>
```

Notice how clean this is. No conditionals, no sidebar logic, no auth checking. It does one thing: center the content. The layout group architecture lets each layout be single-purpose.

### Dark Mode Support

The `dark:` prefix classes (Tailwind's dark mode) work because we set up the dark mode in the root layout or `app.css`. The auth layout inherits this. The `bg-gray-50 dark:bg-gray-900` ensures the background adapts:

```css
/* In app.css — enable class-based dark mode */
@custom-variant dark (&:where(.dark, .dark *));
```

```svelte
<!-- In root +layout.svelte — toggle dark class on <html> -->
<script lang="ts">
  import { browser } from '$app/environment';

  // Check system preference on load
  if (browser) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  }
</script>
```

## App Layout (Full Shell with Auth Guard)

The app layout provides the sidebar, header, and navigation. Its server load function acts as an auth guard — this is the most important architectural pattern in the lesson.

### The Auth Guard

```typescript
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  return {
    user: locals.user
  };
};
```

If `locals.user` is null (the auth hook did not find a valid session), the user is redirected to login. **Every route inside `(app)/` inherits this protection automatically.** You never need to add auth checks to individual pages inside the app group — the layout server load runs before any child page load.

### WRONG vs CORRECT: Auth Protection

```typescript
// WRONG: Checking auth in every page's load function
// src/routes/(app)/dashboard/+page.server.ts
export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');  // Repeated everywhere
  // ...
};

// src/routes/(app)/settings/+page.server.ts
export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');  // Copy-pasted
  // ...
};

// src/routes/(app)/boards/+page.server.ts
export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');  // Again...
  // ...
};
// Problem: Forget ONE page and you have a security hole.

// CORRECT: Auth check in the group layout — covers everything
// src/routes/(app)/+layout.server.ts
export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { user: locals.user };
};
// Every page in (app)/ is protected. No exceptions. No copy-paste.
```

### How locals.user Gets Set

The `locals.user` value comes from a hooks file that runs on every request:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { verifySession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  // Read the session cookie
  const sessionToken = event.cookies.get('session');

  if (sessionToken) {
    // Verify the token and load the user
    const user = await verifySession(sessionToken);
    if (user) {
      event.locals.user = user;
    }
  }

  return resolve(event);
};
```

This runs BEFORE any load function. By the time the `(app)` layout's load function checks `locals.user`, the hook has already populated it (or not). The flow:

```
Request comes in → hooks.server.ts reads cookie → verifies session → sets locals.user
  → (app)/+layout.server.ts checks locals.user → redirects if null
    → dashboard/+page.server.ts runs (user is guaranteed to exist)
```

### The App Layout Component

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  let { data, children } = $props();
  let sidebarOpen = $state(true);

  // Navigation items — could be loaded from the server or defined statically
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' },
    { href: '/boards', label: 'Boards', icon: 'layout' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  // Check if a nav item is active (exact match or starts with)
  function isActive(href: string): boolean {
    if (href === '/dashboard') {
      return page.url.pathname === '/dashboard';
    }
    return page.url.pathname.startsWith(href);
  }
</script>

<svelte:head>
  <title>
    {page.url.pathname === '/dashboard'
      ? 'Dashboard'
      : 'TeamBoard'} — {data.user.name}
  </title>
</svelte:head>

<div class="flex h-screen overflow-hidden">
  <!-- Sidebar -->
  <aside
    class="w-64 border-r bg-white dark:bg-gray-800 flex flex-col transition-transform duration-200"
    class:-translate-x-full={!sidebarOpen}
    class:translate-x-0={sidebarOpen}
  >
    <!-- Sidebar header -->
    <div class="p-4 border-b">
      <h2 class="font-semibold text-lg">TeamBoard</h2>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4 space-y-1" aria-label="App navigation">
      {#each navItems as item (item.href)}
        <a
          href={item.href}
          class="block px-3 py-2 rounded-lg text-sm transition-colors"
          class:bg-indigo-50={isActive(item.href)}
          class:text-indigo-700={isActive(item.href)}
          class:dark:bg-indigo-900={isActive(item.href)}
          class:text-gray-700={!isActive(item.href)}
          class:hover:bg-gray-100={!isActive(item.href)}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <!-- User info at the bottom -->
    <div class="p-4 border-t mt-auto">
      <p class="text-sm font-medium text-gray-900 dark:text-white">
        {data.user.name}
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {data.user.email}
      </p>
      <form method="POST" action="/logout" class="mt-2">
        <button
          type="submit"
          class="text-xs text-red-600 hover:text-red-800 hover:underline"
        >
          Log out
        </button>
      </form>
    </div>
  </aside>

  <!-- Main content area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Mobile header with sidebar toggle -->
    <header class="lg:hidden flex items-center p-4 border-b">
      <button
        onclick={() => sidebarOpen = !sidebarOpen}
        class="p-2 rounded-lg hover:bg-gray-100"
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>

    <!-- Scrollable main content -->
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>
```

Key architectural decisions in this layout:

1. **`flex h-screen overflow-hidden`** on the outer container: the layout fills the viewport exactly. No scrollbar on the body. The sidebar and main content each manage their own scrolling.

2. **`flex-1 overflow-auto`** on `<main>`: only the content area scrolls. The sidebar stays fixed. This is the standard app shell pattern used by Gmail, GitHub, Discord, etc.

3. **`aria-current="page"`** on active links: screen readers announce which page the user is currently on.

4. **Logout as a form POST**: logout should be a POST request (it changes server state), not a GET link. Using a form ensures it works without JavaScript and prevents CSRF via SvelteKit's built-in protection.

## Login Page

The login page uses a traditional SvelteKit form action. Form actions are the right choice here because login should work without client-side JavaScript — progressive enhancement at its best:

```svelte
<!-- src/routes/(auth)/login/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head>
  <title>Log In — TeamBoard</title>
</svelte:head>

<form
  method="POST"
  use:enhance={() => {
    loading = true;
    return async ({ update }) => {
      loading = false;
      await update();
    };
  }}
  class="space-y-4"
>
  {#if form?.error}
    <div class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
                rounded-lg text-sm" role="alert">
      {form.error}
    </div>
  {/if}

  <div>
    <label for="email" class="block text-sm font-medium mb-1">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      required
      autocomplete="email"
      value={form?.email ?? ''}
      class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500
             focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-600"
    />
  </div>

  <div>
    <label for="password" class="block text-sm font-medium mb-1">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      required
      autocomplete="current-password"
      class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500
             focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-600"
    />
  </div>

  <button
    type="submit"
    disabled={loading}
    class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  >
    {loading ? 'Logging in...' : 'Log In'}
  </button>

  <p class="text-center text-sm text-gray-600 dark:text-gray-400">
    No account?
    <a href="/signup" class="text-indigo-600 hover:underline dark:text-indigo-400">
      Sign up
    </a>
  </p>
</form>
```

### The Login Server Action

```typescript
// src/routes/(auth)/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verifyPassword, createSession } from '$lib/server/auth';
import { db } from '$lib/server/database';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;

    // Validate inputs
    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    // Look up the user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    // SECURITY: Use the same error message for "user not found" and
    // "wrong password" to prevent user enumeration attacks.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    // Create a session
    const sessionToken = await createSession(user.id);

    cookies.set('session', sessionToken, {
      path: '/',
      httpOnly: true,     // JavaScript cannot read this cookie
      secure: true,        // Only sent over HTTPS
      sameSite: 'lax',     // CSRF protection
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    redirect(303, '/dashboard');
  }
};
```

### Security Details Worth Understanding

Several security patterns in the login flow deserve explanation:

```typescript
// 1. Same error message for both "not found" and "wrong password"
if (!user || !(await verifyPassword(password, user.passwordHash))) {
  return fail(400, { error: 'Invalid email or password', email });
}
// If you said "User not found" vs "Wrong password", an attacker could
// enumerate valid email addresses by trying different emails and
// watching which error they get. Same message = no information leak.

// 2. Cookie security flags
cookies.set('session', sessionToken, {
  httpOnly: true,   // Prevents XSS from reading the cookie via document.cookie
  secure: true,     // Cookie only sent over HTTPS (not HTTP)
  sameSite: 'lax',  // Browser only sends cookie on same-site requests + top-level navigations
                     // Prevents CSRF attacks from cross-origin forms
  path: '/',        // Cookie available on all routes
  maxAge: 60 * 60 * 24 * 7  // 7 days in seconds
});

// 3. Email normalization
.where(eq(users.email, email.toLowerCase().trim()))
// "User@Example.com " and "user@example.com" should find the same account
```

### The use:enhance Callback Pattern

The `use:enhance` directive progressively enhances the form. Without it, the form submits normally (full page reload). With it, the form submits via fetch (no reload), and you get hooks for loading state:

```svelte
<form
  method="POST"
  use:enhance={() => {
    // This runs BEFORE the form submits
    loading = true;

    return async ({ update, result }) => {
      // This runs AFTER the server responds
      loading = false;

      if (result.type === 'redirect') {
        // SvelteKit handles the redirect automatically
        // No need to do anything here
      }

      // update() applies the server's response to the page
      // (updates form.error, form.email, etc.)
      await update();
    };
  }}
>
```

### WRONG vs CORRECT: Form Enhancement

```svelte
<!-- WRONG: Using fetch manually instead of use:enhance -->
<script>
  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const res = await fetch('/login', {
      method: 'POST',
      body: formData
    });
    // Now you have to handle redirects, errors, cookies manually...
    // And the form doesn't work without JavaScript!
  }
</script>
<form onsubmit={handleSubmit}>...</form>

<!-- CORRECT: use:enhance — works without JS, enhanced with JS -->
<form method="POST" use:enhance>...</form>
<!-- Without JavaScript: traditional form submission (full reload)
     With JavaScript: fetch submission (no reload, smooth UX) -->
```

## Page Options

Different sections of TeamBoard have different rendering requirements. SvelteKit's page options let you configure each section appropriately:

```typescript
// src/routes/+page.ts
// The marketing landing page is static — prerender it at build time
// This generates a static HTML file that can be served from a CDN
export const prerender = true;
```

```typescript
// src/routes/(auth)/+layout.ts
// Auth pages are interactive forms. Disabling SSR means the auth layout
// never renders on the server, which avoids issues with client-only features.
// The login form still works via progressive enhancement.
export const ssr = false;
```

```typescript
// src/routes/(app)/+layout.ts
// The app section requires auth, so SSR is fine (the server has the session).
// CSR must stay enabled for interactivity.
// No special options needed — defaults are correct.
```

### WRONG vs CORRECT: Page Options

```typescript
// WRONG: Prerendering a page that depends on user-specific data
// src/routes/(app)/dashboard/+page.ts
export const prerender = true;
// Prerendering generates ONE static HTML file at build time.
// It cannot include user-specific data (different users see different dashboards).

// CORRECT: Prerender only static pages
// src/routes/pricing/+page.ts
export const prerender = true;
// Pricing is the same for everyone — safe to prerender.

// WRONG: Disabling SSR on the app section
// src/routes/(app)/+layout.ts
export const ssr = false;
// The app section has an auth guard in +layout.server.ts.
// If SSR is disabled, the server load function still runs,
// but the HTML is not server-rendered. This means the user sees
// a blank page until JavaScript loads. The auth guard still works,
// but the perceived load time is worse.

// CORRECT: Keep SSR enabled for the app section
// (No page options needed — defaults are fine)
```

## Custom Error Pages

TeamBoard has error pages at two levels, and understanding which error page renders in which situation is critical for debugging.

### Error Page Resolution

SvelteKit walks UP the route tree to find the nearest `+error.svelte`:

```
Request: /dashboard/nonexistent

1. Check: src/routes/(app)/dashboard/+error.svelte → not found
2. Check: src/routes/(app)/+error.svelte → FOUND, use this
   (renders inside (app)/+layout.svelte — with the sidebar!)

Request: /xyz (no matching route)

1. No route matches, so SvelteKit uses the root error page
2. Check: src/routes/+error.svelte → FOUND, use this
   (renders inside root +layout.svelte — no sidebar)
```

**Critical detail:** the error page renders inside the nearest layout that did NOT throw the error. If `(app)/+layout.server.ts` itself throws, the error page renders inside the ROOT layout (because the app layout is the one that failed). If a page load function throws, the error page renders inside the app layout (because the layout succeeded but the page failed).

### Root Error Page

The root error page handles 404s and unexpected errors across the entire app:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Error {page.status} — TeamBoard</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
  <div class="text-center max-w-md">
    <h1 class="text-7xl font-bold text-gray-200 dark:text-gray-700">
      {page.status}
    </h1>

    <h2 class="text-xl font-semibold mt-4 text-gray-900 dark:text-white">
      {#if page.status === 404}
        Page Not Found
      {:else if page.status === 500}
        Server Error
      {:else if page.status === 403}
        Access Denied
      {:else}
        Something Went Wrong
      {/if}
    </h2>

    <p class="mt-2 text-gray-600 dark:text-gray-400">
      {page.error?.message ?? 'An unexpected error occurred.'}
    </p>

    {#if page.error?.errorId}
      <p class="text-sm text-gray-400 mt-3 font-mono">
        Error ID: {page.error.errorId}
      </p>
    {/if}

    <div class="mt-8 space-x-4">
      <a href="/" class="text-indigo-600 hover:underline dark:text-indigo-400">
        Go home
      </a>
      <button
        onclick={() => window.location.reload()}
        class="text-gray-500 hover:underline"
      >
        Try again
      </button>
    </div>
  </div>
</div>
```

### App Error Page

The app-level error page is more specific — it includes the sidebar (because it renders inside the app layout) and provides a "back to dashboard" link:

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="flex items-center justify-center min-h-[60vh] p-8">
  <div class="text-center max-w-md">
    <h1 class="text-5xl font-bold text-gray-200 dark:text-gray-700">
      {page.status}
    </h1>

    <h2 class="text-lg font-semibold mt-4">
      {#if page.status === 404}
        Page Not Found
      {:else if page.status === 403}
        You don't have access to this resource
      {:else}
        Something Went Wrong
      {/if}
    </h2>

    <p class="mt-2 text-gray-600 dark:text-gray-400">
      {page.error?.message}
    </p>

    {#if page.error?.errorId}
      <p class="text-sm text-gray-400 mt-2 font-mono">
        Reference: {page.error.errorId}
      </p>
    {/if}

    <a
      href="/dashboard"
      class="inline-block mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg
             hover:bg-indigo-700 transition-colors"
    >
      Back to Dashboard
    </a>
  </div>
</div>
```

Because this error page is inside `(app)/`, it inherits the app layout with the sidebar. A 404 inside the app looks different from a 404 on the marketing site. The user keeps their navigation context.

### Custom Error IDs for Debugging

In production, generic error messages protect your users from seeing stack traces. But you still need to debug. Error IDs bridge this gap:

```typescript
// src/hooks.server.ts
import { randomUUID } from 'crypto';
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = randomUUID().slice(0, 8); // Short, shareable ID

  // Log the full error with the ID — this goes to your server logs
  console.error(`[${errorId}]`, {
    status,
    message,
    url: event.url.pathname,
    method: event.request.method,
    error: error instanceof Error ? error.stack : error,
  });

  // Return a safe error object to the client — no stack traces!
  return {
    message: status === 404
      ? 'The page you requested could not be found.'
      : 'An unexpected error occurred. Please try again.',
    errorId,
  };
};
```

Now when a user reports "I got an error," they can share the error ID. You search your logs for that ID and find the full stack trace. The user never sees sensitive implementation details.

### Programmatic Error Throwing

In your load functions and actions, you can throw errors that SvelteKit routes to the error page:

```typescript
// src/routes/(app)/[teamSlug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, params.teamSlug)
  });

  if (!team) {
    error(404, 'Team not found');
    // This renders (app)/+error.svelte with status 404
  }

  const isMember = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, team.id),
      eq(teamMembers.userId, locals.user.id)
    )
  });

  if (!isMember) {
    error(403, 'You are not a member of this team');
    // This renders (app)/+error.svelte with status 403
  }

  return { team };
};
```

### WRONG vs CORRECT: Error Handling

```typescript
// WRONG: Returning error data as normal page data
export const load = async ({ params }) => {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, params.teamSlug)
  });
  return { team }; // team is null — page has to handle null
  // The page now needs {#if data.team} everywhere. Messy.
};

// CORRECT: Throw an error — SvelteKit routes to the error page
export const load = async ({ params }) => {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, params.teamSlug)
  });
  if (!team) error(404, 'Team not found');
  return { team }; // TypeScript now knows team is NOT null
};

// WRONG: Throwing a generic JavaScript error
export const load = async () => {
  throw new Error('Something failed');
  // This becomes a 500 error with the message hidden from the user
  // (for security — you don't want stack traces in the browser)
};

// CORRECT: Using SvelteKit's error() helper with a status code
import { error } from '@sveltejs/kit';
export const load = async () => {
  error(400, 'Invalid request parameters');
  // Status code + message appear in +error.svelte via page.status and page.error.message
};
```

## The Signup Page

For completeness, here is the signup page following the same patterns:

```svelte
<!-- src/routes/(auth)/signup/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head>
  <title>Sign Up — TeamBoard</title>
</svelte:head>

<form
  method="POST"
  use:enhance={() => {
    loading = true;
    return async ({ update }) => {
      loading = false;
      await update();
    };
  }}
  class="space-y-4"
>
  {#if form?.error}
    <div class="p-3 bg-red-50 text-red-700 rounded-lg text-sm" role="alert">
      {form.error}
    </div>
  {/if}

  <div>
    <label for="name" class="block text-sm font-medium mb-1">Name</label>
    <input
      id="name" name="name" type="text" required
      autocomplete="name"
      value={form?.name ?? ''}
      class="w-full px-3 py-2 border rounded-lg"
    />
  </div>

  <div>
    <label for="email" class="block text-sm font-medium mb-1">Email</label>
    <input
      id="email" name="email" type="email" required
      autocomplete="email"
      value={form?.email ?? ''}
      class="w-full px-3 py-2 border rounded-lg"
    />
  </div>

  <div>
    <label for="password" class="block text-sm font-medium mb-1">Password</label>
    <input
      id="password" name="password" type="password" required
      autocomplete="new-password"
      minlength="8"
      class="w-full px-3 py-2 border rounded-lg"
    />
    <p class="text-xs text-gray-500 mt-1">At least 8 characters</p>
  </div>

  <button
    type="submit" disabled={loading}
    class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
           disabled:opacity-50 transition-colors"
  >
    {loading ? 'Creating account...' : 'Sign Up'}
  </button>

  <p class="text-center text-sm text-gray-600">
    Already have an account?
    <a href="/login" class="text-indigo-600 hover:underline">Log in</a>
  </p>
</form>
```

## Try It

Verify the layout structure by testing these scenarios:

1. **Auth layout**: Visit `/login` — you should see the centered auth layout with no sidebar. The app name should appear above the form.

2. **Auth guard**: Visit `/dashboard` without a session cookie — you should be redirected to `/login`. Check the network tab to see the 303 redirect.

3. **App layout**: Visit `/dashboard` with a valid session — you should see the full app layout with sidebar, user info at the bottom, and the dashboard content in the main area.

4. **Root error page**: Visit a nonexistent route like `/xyz` — you should see the root error page (no sidebar, full-page centered layout) with a 404 status.

5. **App error page**: Visit `/dashboard/nonexistent` — you should see the app-level error page with the sidebar still visible. The error renders INSIDE the app layout.

6. **View Transitions**: Navigate between pages by clicking links — you should see a crossfade animation. Open DevTools Network tab and notice that only the page data loads on navigation, not the full HTML.

7. **Progressive enhancement**: Disable JavaScript in DevTools, then try to log in. The form should still submit (full page reload), the auth should still work, and the redirect should still happen. This is progressive enhancement in action.

8. **Error IDs**: Throw an error in a load function and check both the browser (should show a short error ID) and your server console (should show the full error with the same ID).

## Key Takeaways

- Layout groups `(auth)` and `(app)` create separate layout boundaries without affecting URLs — each group gets its own layout, and the parenthesized name is stripped from the URL
- Layout groups replace conditional rendering in layouts — instead of one layout with `{#if isAuthenticated}`, you have clean, single-purpose layouts per group
- `onNavigate` integrates the View Transitions API for smooth crossfade between pages — it fires before navigation, captures a screenshot, then crossfades to the new DOM
- Named view transitions (`view-transition-name`) let persistent elements like sidebars stay in place while only the content area animates
- Auth guard in `+layout.server.ts` protects every route in the group automatically — no per-page checks needed, and forgetting one page cannot create a security hole
- `locals.user` is set by `hooks.server.ts` before any load function runs — the hook reads the session cookie and verifies it on every request
- `use:enhance` progressively enhances forms — they work with and without JavaScript, and you get hooks for loading state and error handling
- Security details matter: same error messages prevent user enumeration, `httpOnly` + `secure` + `sameSite` cookie flags prevent XSS/CSRF, and logout should always be a POST
- Page options (`prerender = true`, `ssr = false`) optimize each section appropriately — prerender static marketing pages, disable SSR only when you have a specific reason
- Custom `+error.svelte` at different route levels shows contextual error UIs — app errors keep the sidebar, root errors show a full-page layout
- SvelteKit walks UP the route tree to find the nearest error page — and the error renders inside the nearest layout that did NOT fail
- `handleError` in `hooks.server.ts` generates error IDs so users can report errors without exposing stack traces
- Use SvelteKit's `error()` helper (not `throw new Error()`) so the status code and message appear in the error page via `page.status` and `page.error.message`
