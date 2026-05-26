# Layouts, Auth Pages & Error Handling

TeamBoard has two distinct sections: public pages (login, signup, marketing) and the authenticated app (dashboard, boards, settings). Layout groups let you give each section its own layout without nesting one inside the other. This lesson builds the layout system, authentication pages, View Transitions, and custom error pages.

## Layout Groups

Create two layout groups in your routes folder:

```
src/routes/
├── (auth)/
│   ├── +layout.svelte      ← minimal centered layout
│   ├── login/+page.svelte
│   └── signup/+page.svelte
├── (app)/
│   ├── +layout.svelte      ← full app shell with sidebar
│   ├── +layout.server.ts   ← auth guard
│   ├── dashboard/+page.svelte
│   └── [teamSlug]/...
├── +layout.svelte           ← root layout (shared by all)
├── +error.svelte            ← root error page
└── +page.svelte             ← marketing landing page
```

The parentheses in `(auth)` and `(app)` tell SvelteKit these are layout groups — they create layout boundaries without adding path segments. The URL `/login` maps to `(auth)/login/+page.svelte`, and `/dashboard` maps to `(app)/dashboard/+page.svelte`.

## Root Layout with View Transitions

The root layout wraps everything. It sets up View Transitions so page navigations animate smoothly:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
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
</svelte:head>

{@render children()}
```

`onNavigate` fires for every client-side navigation. By returning a promise that resolves inside `startViewTransition`, the old page snapshot crossfades into the new page. This works for all navigations across the app — between auth pages and app pages alike.

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
    <h1 class="text-2xl font-bold text-center mb-8">{PUBLIC_APP_NAME}</h1>
    {@render children()}
  </div>
</div>
```

## App Layout (Full Shell with Auth Guard)

The app layout provides the sidebar, header, and navigation. Its server load function acts as an auth guard:

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

If `event.locals.user` is null (the auth hook did not find a valid session), the user is redirected to login. Every route inside `(app)/` inherits this protection automatically.

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  let { data, children } = $props();
</script>

<svelte:head>
  <title>Dashboard — {data.user.name}</title>
</svelte:head>

<div class="flex h-screen">
  <!-- Sidebar -->
  <aside class="w-64 border-r bg-white dark:bg-gray-800 p-4">
    <nav class="space-y-1">
      <a
        href="/dashboard"
        class="block px-3 py-2 rounded-lg"
        class:bg-indigo-50={page.url.pathname === '/dashboard'}
        class:dark:bg-indigo-900={page.url.pathname === '/dashboard'}
      >
        Dashboard
      </a>
      <!-- Team links would be dynamically rendered here -->
    </nav>

    <div class="mt-auto pt-4 border-t">
      <p class="text-sm text-gray-600 dark:text-gray-400">{data.user.name}</p>
      <p class="text-xs text-gray-400">{data.user.email}</p>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 overflow-auto">
    {@render children()}
  </main>
</div>
```

## Login Page

The login page uses a traditional SvelteKit form action. You will upgrade to remote functions in Module 45, but form actions are the right choice here because login does not need client-side JavaScript to work:

```svelte
<!-- src/routes/(auth)/login/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
</script>

<svelte:head>
  <title>Log In</title>
</svelte:head>

<form method="POST" use:enhance class="space-y-4">
  {#if form?.error}
    <div class="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
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
      value={form?.email ?? ''}
      class="w-full px-3 py-2 border rounded-lg"
    />
  </div>

  <div>
    <label for="password" class="block text-sm font-medium mb-1">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      required
      class="w-full px-3 py-2 border rounded-lg"
    />
  </div>

  <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
    Log In
  </button>

  <p class="text-center text-sm text-gray-600">
    No account? <a href="/signup" class="text-indigo-600 hover:underline">Sign up</a>
  </p>
</form>
```

```typescript
// src/routes/(auth)/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verifyPassword } from '$server/auth';
import { createSession } from '$server/auth';
import { db } from '$server/database';
import { users } from '$server/schema';
import { eq } from 'drizzle-orm';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    const sessionToken = createSession(user.id);

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

## Page Options

The marketing landing page should be prerendered — it is static content that does not change per request:

```typescript
// src/routes/+page.ts
export const prerender = true;
```

Auth pages do not need SSR since they are interactive forms that require JavaScript for the best experience. Disabling SSR here means the auth layout never renders on the server, which avoids flash-of-unstyled-content issues with client-only features:

```typescript
// src/routes/(auth)/+layout.ts
export const ssr = false;
```

## Custom Error Pages

TeamBoard has error pages at two levels:

The root error page handles 404s and unexpected errors across the entire app:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Error {page.status}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-6xl font-bold text-gray-300">{page.status}</h1>
    <p class="text-xl mt-4">{page.error?.message ?? 'Something went wrong'}</p>

    {#if page.error?.errorId}
      <p class="text-sm text-gray-500 mt-2">Error ID: {page.error.errorId}</p>
    {/if}

    <a href="/" class="inline-block mt-6 text-indigo-600 hover:underline">
      Go home
    </a>
  </div>
</div>
```

The app-level error page is more specific — it includes the sidebar and a "back to dashboard" link:

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="p-8">
  <h1 class="text-2xl font-bold">
    {page.status === 404 ? 'Page Not Found' : 'Something Went Wrong'}
  </h1>
  <p class="mt-2 text-gray-600">{page.error?.message}</p>

  {#if page.error?.errorId}
    <p class="text-sm text-gray-400 mt-1">
      Reference: {page.error.errorId}
    </p>
  {/if}

  <a href="/dashboard" class="inline-block mt-4 text-indigo-600 hover:underline">
    Back to Dashboard
  </a>
</div>
```

Because this error page is inside `(app)/`, it inherits the app layout with the sidebar. A 404 inside the app looks different from a 404 on the marketing site. SvelteKit walks up the route tree to find the nearest `+error.svelte`.

## Try It

Verify the layout structure:
1. Visiting `/login` should show the centered auth layout
2. Visiting `/dashboard` without a session should redirect to `/login`
3. Visiting `/dashboard` with a session should show the app layout with sidebar
4. Visiting a nonexistent route like `/xyz` should show the root error page
5. Visiting `/dashboard/nonexistent` should show the app-level error page with the sidebar

## Key Takeaways

- Layout groups `(auth)` and `(app)` create separate layout boundaries without affecting URLs
- `onNavigate` integrates the View Transitions API for smooth crossfade between pages
- `svelte:head` injects page-specific titles and meta tags
- Auth guard in `+layout.server.ts` protects every route in the group — no per-page checks needed
- Page options (`prerender = true`, `ssr = false`) optimize each section appropriately
- Custom `+error.svelte` at different route levels shows contextual error UIs
- SvelteKit walks up the route tree to find the nearest error page
