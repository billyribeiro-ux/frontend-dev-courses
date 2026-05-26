# Layouts, Auth Pages & Error Handling

TeamBoard has two distinct sections: public pages (login, signup, marketing) and the authenticated app (dashboard, boards, settings). Layout groups let you give each section its own layout without nesting one inside the other. This lesson builds the complete layout system, authentication pages, View Transitions, comprehensive error handling at multiple levels, loading states during navigation, and custom error classes — the production-grade foundation every multi-section SvelteKit application needs.

## Layout Groups

SvelteKit's layout groups solve a fundamental routing problem: how do you give different sections of your app completely different layouts without nesting one inside the other? The login page should be a clean, centered card with no sidebar. The dashboard should have a sidebar, header, and breadcrumbs. But both live under the same domain, and you do not want the dashboard layout wrapping the login page.

Layout groups use parentheses in the folder name: `(auth)` and `(app)`. The parentheses tell SvelteKit two things: (1) this directory creates a layout boundary — it gets its own `+layout.svelte`, and (2) the directory name does NOT appear in the URL. The URL `/login` maps to `(auth)/login/+page.svelte`, and `/dashboard` maps to `(app)/dashboard/+page.svelte`.

```
src/routes/
├── (auth)/
│   ├── +layout.svelte      ← minimal centered layout
│   ├── +layout.ts           ← page options for auth pages
│   ├── login/
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   ├── signup/
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   └── forgot-password/
│       ├── +page.svelte
│       └── +page.server.ts
├── (app)/
│   ├── +layout.svelte      ← full app shell with sidebar
│   ├── +layout.server.ts   ← auth guard — protects ALL routes in this group
│   ├── +error.svelte        ← app-level error page (inherits the sidebar)
│   ├── dashboard/+page.svelte
│   ├── settings/
│   │   ├── +layout.svelte   ← settings sub-layout with tabs
│   │   ├── profile/+page.svelte
│   │   ├── team/+page.svelte
│   │   └── billing/+page.svelte
│   └── [teamSlug]/
│       ├── +layout.svelte   ← team-specific layout with team header
│       ├── +layout.server.ts ← team membership check
│       ├── +error.svelte     ← team-level error page
│       ├── +page.svelte
│       └── boards/
│           ├── +page.svelte
│           └── [boardId]/+page.svelte
├── +layout.svelte           ← root layout (shared by ALL pages)
├── +error.svelte            ← root error page (fallback for all errors)
└── +page.svelte             ← marketing landing page
```

This hierarchy creates three levels of error pages and four levels of layouts. Understanding how SvelteKit walks this tree — for both rendering and error handling — is the key to building maintainable multi-section applications.

### How Layout Nesting Works

Every page inherits ALL layouts above it in the file tree. For a page at `(app)/[teamSlug]/boards/[boardId]/+page.svelte`, SvelteKit renders:

```
+layout.svelte (root)
  └── (app)/+layout.svelte (app shell)
       └── (app)/[teamSlug]/+layout.svelte (team header)
            └── (app)/[teamSlug]/boards/[boardId]/+page.svelte (the page)
```

Each layout renders its `children` snippet, which contains the next layout or page in the chain. The root layout wraps everything. The app layout adds the sidebar. The team layout adds the team header. The page fills in the content.

This nesting is automatic — you do not wire it up manually. SvelteKit determines the layout chain based on the file system hierarchy and renders them in order.

## Root Layout with View Transitions

The root layout wraps every page in the application. It is the place for global concerns: View Transitions, the viewport meta tag, global fonts, and analytics:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import '../app.css';

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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
</svelte:head>

{@render children()}
```

`onNavigate` fires for every client-side navigation. By returning a promise that resolves inside `startViewTransition`, the old page snapshot crossfades into the new page. This works for all navigations across the app — between auth pages and app pages alike.

### How View Transitions Work Under the Hood

The View Transitions API captures a "screenshot" of the current state, applies the DOM changes (the new page), and then crossfades between the old screenshot and the new live DOM. The browser handles the animation in the compositor — it is smooth even on low-end devices because it does not run on the main thread.

The CSS that controls the transition:

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

/* Named transitions for specific elements (e.g., hero images) */
::view-transition-old(hero-image) {
  animation: 200ms ease-out both fade-out;
}
::view-transition-new(hero-image) {
  animation: 200ms ease-in both fade-in;
}
```

You can assign view transition names to specific elements for element-level transitions (morphing a thumbnail into a full-size image):

```svelte
<img
  src={product.image}
  alt={product.name}
  style="view-transition-name: hero-image;"
/>
```

## Auth Layout (Centered, Minimal)

The auth layout is a simple centered card — no sidebar, no header:

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
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{PUBLIC_APP_NAME}</h1>
      <p class="text-sm text-gray-500 mt-1">Collaborative project management</p>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
      {@render children()}
    </div>
  </div>
</div>
```

```typescript
// src/routes/(auth)/+layout.ts
export const ssr = false;
```

Setting `ssr = false` on the auth layout means these pages are never server-rendered. This avoids flash-of-unstyled-content issues with client-only features and reduces server load since auth pages are interactive forms that require JavaScript anyway.

### Auth Layout Redirect

If a user is already authenticated, visiting `/login` should redirect them to the dashboard:

```typescript
// src/routes/(auth)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (locals.user) {
    redirect(303, '/dashboard');
  }
};
```

## App Layout (Full Shell with Auth Guard)

The app layout provides the sidebar, header, navigation, and user information. Its server load function acts as an auth guard — the single most important line of code in your application's security model:

```typescript
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { teams, teamMembers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  // Fetch the user's teams for the sidebar navigation
  const userTeams = await db
    .select({
      slug: teams.slug,
      name: teams.name,
      role: teamMembers.role
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, locals.user.id));

  return {
    user: locals.user,
    teams: userTeams
  };
};
```

If `event.locals.user` is null (the auth hook did not find a valid session), the user is redirected to login. Every route inside `(app)/` inherits this protection automatically — no per-page checks needed.

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { navigating } from '$app/state';
  import { enhance } from '$app/forms';

  let { data, children } = $props();
  let sidebarOpen = $state(true);
  let innerWidth = $state(0);

  // Auto-collapse sidebar on mobile
  $effect(() => {
    if (innerWidth < 768) {
      sidebarOpen = false;
    }
  });
</script>

<svelte:window bind:innerWidth />

<svelte:head>
  <title>Dashboard - {data.user.name}</title>
</svelte:head>

<!-- Top loading bar during navigation -->
{#if navigating.to}
  <div class="fixed top-0 left-0 right-0 h-1 bg-indigo-100 z-50">
    <div class="h-full bg-indigo-600 animate-progress"></div>
  </div>
{/if}

<div class="flex h-screen overflow-hidden">
  <!-- Sidebar -->
  {#if sidebarOpen}
    <aside class="w-64 border-r bg-white dark:bg-gray-800 flex flex-col overflow-y-auto">
      <div class="p-4 border-b">
        <h2 class="font-semibold text-sm text-gray-500 uppercase tracking-wider">Teams</h2>
      </div>

      <nav class="flex-1 p-2 space-y-1">
        <a
          href="/dashboard"
          class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          class:bg-indigo-50={page.url.pathname === '/dashboard'}
          class:text-indigo-700={page.url.pathname === '/dashboard'}
          class:dark:bg-indigo-900={page.url.pathname === '/dashboard'}
          class:text-gray-700={page.url.pathname !== '/dashboard'}
          class:hover:bg-gray-100={page.url.pathname !== '/dashboard'}
        >
          Dashboard
        </a>

        {#each data.teams as team (team.slug)}
          <a
            href="/{team.slug}"
            class="block px-3 py-2 rounded-lg text-sm transition-colors"
            class:bg-indigo-50={page.url.pathname.startsWith(`/${team.slug}`)}
            class:text-indigo-700={page.url.pathname.startsWith(`/${team.slug}`)}
            class:text-gray-700={!page.url.pathname.startsWith(`/${team.slug}`)}
            class:hover:bg-gray-100={!page.url.pathname.startsWith(`/${team.slug}`)}
          >
            {team.name}
            {#if team.role === 'admin'}
              <span class="text-xs text-gray-400 ml-1">admin</span>
            {/if}
          </a>
        {/each}

        <a
          href="/settings/profile"
          class="block px-3 py-2 rounded-lg text-sm transition-colors"
          class:bg-indigo-50={page.url.pathname.startsWith('/settings')}
          class:text-indigo-700={page.url.pathname.startsWith('/settings')}
          class:text-gray-700={!page.url.pathname.startsWith('/settings')}
        >
          Settings
        </a>
      </nav>

      <!-- User info and logout -->
      <div class="p-4 border-t">
        <div class="flex items-center gap-3">
          {#if data.user.avatarUrl}
            <img src={data.user.avatarUrl} alt="" width={32} height={32} class="rounded-full" />
          {:else}
            <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700">
              {data.user.name[0]}
            </div>
          {/if}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{data.user.name}</p>
            <p class="text-xs text-gray-500 truncate">{data.user.email}</p>
          </div>
        </div>
        <form method="POST" action="/logout" use:enhance class="mt-3">
          <button type="submit" class="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  {/if}

  <!-- Main content area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Top bar with sidebar toggle and breadcrumbs -->
    <header class="h-14 border-b bg-white dark:bg-gray-800 flex items-center px-4 gap-4">
      <button
        class="p-1 rounded-lg hover:bg-gray-100"
        onclick={() => { sidebarOpen = !sidebarOpen; }}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden="true">
          <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
        </svg>
      </button>

      <nav aria-label="Breadcrumb" class="text-sm text-gray-500">
        {#each page.url.pathname.split('/').filter(Boolean) as segment, i}
          {#if i > 0}
            <span class="mx-1">/</span>
          {/if}
          <span class="capitalize">{segment.replace(/-/g, ' ')}</span>
        {/each}
      </nav>
    </header>

    <!-- Page content -->
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>

<style>
  @keyframes progress {
    0% { width: 0%; }
    50% { width: 70%; }
    100% { width: 90%; }
  }

  .animate-progress {
    animation: progress 2s ease-in-out;
    animation-fill-mode: forwards;
  }
</style>
```

### Nested Layout: Settings with Tabs

The settings section has its own sub-layout with a tab bar:

```svelte
<!-- src/routes/(app)/settings/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  let { children } = $props();

  const tabs = [
    { href: '/settings/profile', label: 'Profile' },
    { href: '/settings/team', label: 'Team' },
    { href: '/settings/billing', label: 'Billing' }
  ];
</script>

<svelte:head>
  <title>Settings</title>
</svelte:head>

<div class="max-w-4xl">
  <h1 class="text-2xl font-bold mb-6">Settings</h1>

  <nav class="border-b mb-6" aria-label="Settings tabs">
    <div class="flex gap-4">
      {#each tabs as tab (tab.href)}
        <a
          href={tab.href}
          class="pb-3 text-sm font-medium border-b-2 transition-colors -mb-px"
          class:border-indigo-600={page.url.pathname === tab.href}
          class:text-indigo-600={page.url.pathname === tab.href}
          class:border-transparent={page.url.pathname !== tab.href}
          class:text-gray-500={page.url.pathname !== tab.href}
          class:hover:text-gray-700={page.url.pathname !== tab.href}
          aria-current={page.url.pathname === tab.href ? 'page' : undefined}
        >
          {tab.label}
        </a>
      {/each}
    </div>
  </nav>

  {@render children()}
</div>
```

When a user visits `/settings/profile`, SvelteKit renders: root layout -> app layout (sidebar) -> settings layout (tabs) -> profile page. Each layout adds its own structure, and the page fills in the content area.

## Login Page with Progressive Enhancement

The login page uses a traditional SvelteKit form action with `use:enhance` for progressive enhancement:

```svelte
<!-- src/routes/(auth)/login/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Log In</title>
</svelte:head>

<form
  method="POST"
  use:enhance={() => {
    submitting = true;
    return async ({ update }) => {
      submitting = false;
      await update();
    };
  }}
  class="space-y-4"
>
  <h2 class="text-xl font-semibold text-center text-gray-900 dark:text-white">
    Welcome back
  </h2>

  {#if form?.error}
    <div
      class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm"
      role="alert"
    >
      {form.error}
    </div>
  {/if}

  <div>
    <label for="email" class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Email</label>
    <input
      id="email" name="email" type="email" required autocomplete="email"
      value={form?.email ?? ''}
      class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      disabled={submitting}
    />
  </div>

  <div>
    <label for="password" class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Password</label>
    <input
      id="password" name="password" type="password" required autocomplete="current-password"
      class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      disabled={submitting}
    />
  </div>

  <button
    type="submit"
    class="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={submitting}
  >
    {#if submitting}Signing in...{:else}Sign In{/if}
  </button>

  <div class="flex justify-between text-sm">
    <a href="/forgot-password" class="text-indigo-600 hover:underline">Forgot password?</a>
    <a href="/signup" class="text-indigo-600 hover:underline">Create account</a>
  </div>
</form>
```

```typescript
// src/routes/(auth)/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verifyPassword, createSession } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { rateLimit } from '$lib/server/rate-limit';

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    // Rate limit login attempts — 10 per minute per IP
    try {
      rateLimit(`login:${getClientAddress()}`, 10, 60_000);
    } catch {
      return fail(429, { error: 'Too many login attempts. Please wait a minute.' });
    }

    const data = await request.formData();
    const email = (data.get('email') as string)?.trim().toLowerCase();
    const password = data.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    const [user] = await db
      .select().from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always hash the password even if user doesn't exist
    // This prevents timing attacks that reveal whether an email is registered
    if (!user) {
      await verifyPassword(password, '$2b$12$invalidhashtowastetimedummy');
      return fail(400, { error: 'Invalid email or password', email });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    const sessionToken = await createSession(user.id);

    cookies.set('session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    redirect(303, '/dashboard');
  }
};
```

Security details worth noting:
- **Rate limiting** prevents brute-force attacks on the login endpoint
- **Timing-safe comparison**: we hash even when the user does not exist, preventing attackers from determining which emails are registered by measuring response time
- **Generic error message**: "Invalid email or password" does not reveal whether the email exists
- **Secure cookie flags**: `httpOnly` prevents JavaScript access, `secure` requires HTTPS, `sameSite: 'lax'` provides CSRF protection

## Page Options

Different sections of the app need different rendering strategies:

```typescript
// src/routes/+page.ts — Marketing landing page
export const prerender = true;
```

```typescript
// src/routes/(auth)/+layout.ts — Auth pages
export const ssr = false;
```

The `prerender = true` option generates a static HTML file at build time. The marketing page is served from a CDN with zero server processing — the fastest possible load time.

## Custom Error Handling — The Complete Architecture

Error handling in SvelteKit follows a hierarchy: when an error occurs, SvelteKit walks up the route tree looking for the nearest `+error.svelte` file. This means you can have different error pages for different sections of your app.

### Custom Error Helpers

Define application-specific error helpers that generate error IDs for debugging:

```typescript
// src/lib/server/errors.ts
import { error } from '@sveltejs/kit';

export function notFound(resource: string, id?: string): never {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${resource} not found: ${id ?? 'unknown'}`);
  throw error(404, {
    message: `${resource} not found`,
    errorId
  } as any);
}

export function forbidden(reason: string): never {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] Forbidden: ${reason}`);
  throw error(403, {
    message: 'You do not have permission to access this resource',
    errorId
  } as any);
}

export function badRequest(message: string, errors?: Record<string, string>): never {
  throw error(400, { message, errors } as any);
}
```

Use these helpers in your load functions:

```typescript
// src/routes/(app)/[teamSlug]/+layout.server.ts
import { notFound, forbidden } from '$lib/server/errors';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { teams, teamMembers } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ params, locals }) => {
  const [team] = await db
    .select().from(teams)
    .where(eq(teams.slug, params.teamSlug))
    .limit(1);

  if (!team) {
    notFound('Team', params.teamSlug);
  }

  const [membership] = await db
    .select().from(teamMembers)
    .where(and(
      eq(teamMembers.teamId, team.id),
      eq(teamMembers.userId, locals.user!.id)
    ))
    .limit(1);

  if (!membership) {
    forbidden(`User ${locals.user!.id} is not a member of team ${team.slug}`);
  }

  return { team, membership };
};
```

### The Error Page Hierarchy

**Root error page** — the ultimate fallback for any error:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  const messages: Record<number, string> = {
    404: 'The page you are looking for does not exist.',
    403: 'You do not have permission to view this page.',
    500: 'Something went wrong on our end. We have been notified.'
  };
</script>

<svelte:head>
  <title>Error {page.status}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
  <div class="text-center px-4">
    <h1 class="text-8xl font-bold text-gray-200 dark:text-gray-700">{page.status}</h1>
    <p class="text-xl text-gray-600 dark:text-gray-400 mt-4">
      {messages[page.status] ?? page.error?.message ?? 'An unexpected error occurred'}
    </p>

    {#if page.error?.errorId}
      <p class="text-sm text-gray-400 mt-2">
        Reference: <code>{page.error.errorId}</code>
      </p>
    {/if}

    <div class="mt-8 flex gap-4 justify-center">
      <a href="/" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
        Go Home
      </a>
      <button
        onclick={() => history.back()}
        class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
      >
        Go Back
      </button>
    </div>
  </div>
</div>
```

**App-level error page** — inherits the sidebar from the app layout:

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="max-w-lg mx-auto py-12 text-center">
  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
    {#if page.status === 404}
      Page Not Found
    {:else if page.status === 403}
      Access Denied
    {:else}
      Something Went Wrong
    {/if}
  </h1>

  <p class="mt-3 text-gray-600 dark:text-gray-400">
    {page.error?.message ?? 'An unexpected error occurred'}
  </p>

  {#if page.error?.errorId}
    <p class="text-sm text-gray-400 mt-2">
      Reference: <code class="bg-gray-100 px-2 py-0.5 rounded">{page.error.errorId}</code>
    </p>
  {/if}

  <a href="/dashboard" class="inline-block mt-6 text-indigo-600 hover:underline font-medium">
    Back to Dashboard
  </a>
</div>
```

Because this error page is inside `(app)/`, it inherits the app layout with the sidebar. A 404 inside the app looks different from a 404 on the marketing site.

**Team-level error page** — specific to team routes:

```svelte
<!-- src/routes/(app)/[teamSlug]/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="max-w-lg mx-auto py-12 text-center">
  <h1 class="text-2xl font-bold">
    {#if page.status === 403}
      Not a Team Member
    {:else if page.status === 404}
      Team Not Found
    {:else}
      Error
    {/if}
  </h1>

  <p class="mt-3 text-gray-600">{page.error?.message}</p>

  {#if page.status === 403}
    <p class="mt-2 text-sm text-gray-500">
      Contact the team administrator to request access.
    </p>
  {/if}

  <a href="/dashboard" class="inline-block mt-6 text-indigo-600 hover:underline">
    Back to Dashboard
  </a>
</div>
```

### Error Handling in Hooks

The `handleError` hook runs for every unhandled error. This is where you log errors, generate error IDs, and sanitize messages:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  console.error(`[${errorId}] ${event.request.method} ${event.url.pathname}:`, error);

  // In production, report to error tracking (Sentry, DataDog, etc.)

  return {
    message: status === 500
      ? 'An internal error occurred. Our team has been notified.'
      : message,
    errorId
  };
};
```

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] Client error:`, error);

  return {
    message: 'Something went wrong. Please try refreshing the page.',
    errorId
  };
};
```

### Error Boundaries for Component-Level Errors

For errors that should not crash the entire page, use `<svelte:boundary>`:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import QuickActions from '$lib/components/QuickActions.svelte';

  let { data } = $props();
</script>

<h1 class="text-2xl font-bold mb-6">Dashboard</h1>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div class="lg:col-span-2">
    <svelte:boundary>
      <ActivityFeed items={data.recentActivity} />
      {#snippet failed(error, reset)}
        <div class="p-4 bg-red-50 rounded-lg">
          <p>Could not load activity feed.</p>
          <button onclick={reset} class="text-indigo-600 hover:underline mt-2">Retry</button>
        </div>
      {/snippet}
    </svelte:boundary>
  </div>

  <div>
    <svelte:boundary>
      <QuickActions teams={data.teams} />
      {#snippet failed(error, reset)}
        <div class="p-4 bg-red-50 rounded-lg">
          <p>Could not load quick actions.</p>
          <button onclick={reset} class="text-indigo-600 hover:underline mt-2">Retry</button>
        </div>
      {/snippet}
    </svelte:boundary>
  </div>
</div>
```

## Loading States During Navigation

The `navigating` state from `$app/state` contains `from` and `to` URL objects during navigation, and is falsy otherwise. The app layout above already includes a progress bar. Here is a more advanced pattern with a loading overlay for slow navigations:

```svelte
<script lang="ts">
  import { navigating } from '$app/state';

  // Only show loading state if navigation takes more than 300ms
  let showLoadingOverlay = $state(false);
  let loadingTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (navigating.to) {
      loadingTimer = setTimeout(() => {
        showLoadingOverlay = true;
      }, 300);
    } else {
      clearTimeout(loadingTimer);
      showLoadingOverlay = false;
    }

    return () => clearTimeout(loadingTimer);
  });
</script>

{#if showLoadingOverlay}
  <div class="fixed inset-0 bg-white/50 z-40 flex items-center justify-center">
    <div class="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
  </div>
{/if}
```

The 300ms delay prevents the loading overlay from flashing on fast navigations — it only appears for genuinely slow transitions.

## Try It

Verify the layout and error structure works end-to-end:

1. **Layout inheritance**: Visit `/login` — should show the centered auth layout. Visit `/dashboard` — should show the app layout with sidebar. Visit `/settings/profile` — should show the app layout + settings tabs.

2. **Auth guard**: Visit `/dashboard` without a session — should redirect to `/login`. Visit `/login` with an active session — should redirect to `/dashboard`.

3. **Error page hierarchy**: Visit `/nonexistent` — should show the root error page (no sidebar). Visit `/dashboard/nonexistent` — should show the app-level error page (with sidebar). Visit `/team-slug/nonexistent-board` — should show the team-level error page.

4. **View Transitions**: Navigate between pages and verify the crossfade animation plays. Try navigating between auth and app pages.

5. **Loading states**: Add a 2-second delay to a load function (`await new Promise(r => setTimeout(r, 2000))`) and navigate to that page. The loading bar should appear during the delay.

6. **Error boundaries**: Create a component that throws during rendering. Wrap it in `<svelte:boundary>` and verify the fallback shows while the rest of the page works.

7. **Mobile responsiveness**: Resize below 768px — the sidebar should collapse. The toggle button should open and close it.

## Key Takeaways

- Layout groups `(auth)` and `(app)` create separate layout boundaries without affecting URLs — use them for sections with completely different visual structures
- Every page inherits all layouts above it in the file tree — layouts nest automatically based on directory structure
- Auth guards in `+layout.server.ts` protect every route in the group with a single check — no per-page guards needed
- `onNavigate` with the View Transitions API provides smooth crossfade animations between pages with minimal code
- `<svelte:head>` injects page-specific titles, meta tags, and preload hints — server-rendered for SEO
- Page options (`prerender = true`, `ssr = false`) optimize rendering strategy per section
- SvelteKit walks up the route tree to find the nearest `+error.svelte` — place error pages at each level for contextual error UIs
- The app-level error page inherits the app layout (sidebar), while the root error page gets a full-page layout
- Custom error helpers (`notFound`, `forbidden`, `badRequest`) generate error IDs for debugging and sanitize messages for the client
- `handleError` hooks (server and client) log full errors, report to tracking services, and return sanitized messages
- `<svelte:boundary>` catches component-level errors without crashing the entire page — use the bulkhead pattern for independent sections
- The `navigating` state from `$app/state` enables loading bars and navigation indicators — add a delay threshold to avoid flash on fast navigations
- Always return generic error messages to the client ("Invalid email or password") — never reveal whether specific data exists
- Rate limiting on auth endpoints prevents brute-force attacks — implement at the action level with IP-based throttling
- Timing-safe password comparison prevents enumeration attacks — always hash even when the user does not exist
