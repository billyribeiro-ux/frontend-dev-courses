# Protected Routes

With authentication in place, you need to control which pages require a logged-in user. **Protected routes** check for authentication in the load function and redirect unauthenticated users to the login page. You will also update the UI to reflect the user's auth state and implement logout.

## Auth Guards in Load Functions

Check `event.locals.user` (set by your hook) in any server load function:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  return {
    user: locals.user
  };
};
```

If the user is not logged in, they are redirected to `/login` before the page ever renders. The `303` status code tells the browser to make a GET request to the redirect URL.

## Protecting Multiple Routes with Layouts

Instead of adding auth checks to every page, use a layout load function to protect an entire section:

```typescript
// src/routes/(protected)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  return {
    user: locals.user
  };
};
```

Place all pages that require authentication inside a `(protected)` route group. The parentheses mean the folder name does not appear in the URL:

```
src/routes/
  (protected)/
    +layout.server.ts   ← Auth check here
    dashboard/
      +page.svelte
    settings/
      +page.svelte
    profile/
      +page.svelte
  login/
    +page.svelte         ← Public
  register/
    +page.svelte         ← Public
```

Every page inside `(protected)` automatically requires authentication.

## UI Based on Auth State

Pass the user data to the root layout so the entire app can adjust its UI:

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user ?? null
  };
};
```

Now use this in your layout component to show different navigation:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<nav>
  <a href="/">Home</a>

  {#if data.user}
    <a href="/dashboard">Dashboard</a>
    <span>Hello, {data.user.name}</span>
    <form method="POST" action="/logout">
      <button type="submit">Log Out</button>
    </form>
  {:else}
    <a href="/login">Log In</a>
    <a href="/register">Register</a>
  {/if}
</nav>

<main>
  {@render children()}
</main>
```

The navigation adapts automatically based on whether the user is logged in.

## Implementing Logout

Logout deletes the session from the database and clears the cookie:

```typescript
// src/routes/logout/+page.server.ts
import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';

export const actions: Actions = {
  default: async ({ cookies }) => {
    const sessionId = cookies.get('session');

    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      cookies.delete('session', { path: '/' });
    }

    throw redirect(303, '/login');
  }
};
```

## Redirecting Logged-In Users

Prevent logged-in users from seeing the login and register pages:

```typescript
// src/routes/login/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, '/dashboard');
  }
};

export const actions: Actions = {
  // ... login action from previous lesson
};
```

## Try It

Set up a route group `(protected)` containing a dashboard page and a settings page. Add a root layout that shows different navigation based on auth state. Implement the logout action. Test the full flow: visit `/dashboard` while logged out (should redirect to `/login`), log in, see the dashboard, click logout, and confirm you are redirected back to `/login`.

## Key Takeaways

- Check `locals.user` in load functions and `throw redirect(303, '/login')` for unauthenticated users
- Use route groups like `(protected)` with a layout load function to guard multiple pages at once
- Pass user data from the root layout so all components can adjust their UI
- Logout deletes the session from the database and clears the cookie
- Redirect authenticated users away from login/register pages
- The `303` redirect status code ensures the browser makes a GET request
