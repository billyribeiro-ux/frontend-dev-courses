# Protected Routes

With authentication in place, you need to control which pages require a logged-in user. **Protected routes** check for authentication in the load function and redirect unauthenticated users to the login page. But route protection goes far beyond a simple "logged in or not" check. Production applications need role-based access control, API route protection, client-side navigation guards, progressive disclosure, and a unified auth context that every component can consume.

This lesson builds a complete authorization system, starting from basic redirects and ending with a multi-role architecture that handles every edge case.

## Auth Guards in Load Functions

The simplest form of route protection checks `event.locals.user` (set by your auth hook) in a server load function:

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

Why 303 and not 302? SvelteKit uses 303 because it guarantees the browser makes a GET request after the redirect. A 302 technically allows the browser to repeat the original method (POST stays POST), which can cause confusing behavior when a form action redirects. With 303, the redirect is always a GET, regardless of what method triggered it.

### Preserving the Original URL

A common UX pattern: after login, redirect the user back to the page they were trying to access. Encode the original URL as a query parameter:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Encode the current path so the login page can redirect back here
    const redirectTo = encodeURIComponent(url.pathname + url.search);
    throw redirect(303, `/login?redirectTo=${redirectTo}`);
  }

  return { user: locals.user };
};
```

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
  default: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    // ... validate credentials, create session ...

    // After successful login, redirect to the original page or dashboard
    const redirectTo = url.searchParams.get('redirectTo') || '/dashboard';

    // SECURITY: validate that redirectTo is a local path, not an external URL
    // This prevents open redirect attacks
    const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard';

    throw redirect(303, safeRedirect);
  }
};
```

The security check on `redirectTo` is critical. Without it, an attacker could craft a URL like `/login?redirectTo=https://evil.com` and phish users. Always validate that redirect targets are local paths.

## Protecting Multiple Routes with Layout Groups

Instead of adding auth checks to every page individually, use a layout load function to protect an entire route group:

```
src/routes/
  (protected)/
    +layout.server.ts     ← Auth check here — protects everything below
    dashboard/
      +page.svelte
    settings/
      +page.svelte
      account/
        +page.svelte
      billing/
        +page.svelte
    profile/
      +page.svelte
  (admin)/
    +layout.server.ts     ← Admin-only auth check
    admin/
      +page.svelte
      users/
        +page.svelte
      analytics/
        +page.svelte
  login/
    +page.svelte           ← Public
  register/
    +page.svelte           ← Public
  +page.svelte             ← Public (homepage)
```

The parentheses in `(protected)` create a route group — the folder name does not appear in the URL. `/dashboard` still resolves to `src/routes/(protected)/dashboard/+page.svelte`, but the layout auth check at `(protected)/+layout.server.ts` runs first.

```typescript
// src/routes/(protected)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
  }

  return {
    user: locals.user
  };
};
```

Every page inside `(protected)` automatically requires authentication. Add a new page at `(protected)/projects/+page.svelte` and it is protected without writing a single line of auth code.

## Hooks-Based Auth Checking

For applications where most routes are protected, checking auth in hooks is more efficient than layout guards. The hook runs once per request before any load functions execute:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

// Routes that do NOT require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/about',
  '/pricing',
  '/terms',
  '/privacy'
];

// Routes that require specific roles
const ROLE_ROUTES: Record<string, string[]> = {
  '/admin': ['admin'],
  '/moderator': ['admin', 'moderator']
};

export const handle: Handle = async ({ event, resolve }) => {
  // Session resolution — runs for every request
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = await getSessionWithUser(sessionId);
    if (session && session.expiresAt > new Date()) {
      event.locals.user = session.user;
    } else if (session) {
      // Session expired — clean up
      event.cookies.delete('session', { path: '/' });
    }
  }

  // Auth check for protected routes
  const path = event.url.pathname;

  // Skip auth check for public routes
  const isPublic = PUBLIC_ROUTES.some(route =>
    path === route || path.startsWith(route + '/')
  );

  // Skip auth check for static assets and API routes (API routes handle their own auth)
  const isAsset = path.startsWith('/_app/') || path.startsWith('/favicon');
  const isApi = path.startsWith('/api/');

  if (!isPublic && !isAsset && !isApi && !event.locals.user) {
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(path)}`);
  }

  // Role-based access control
  for (const [routePrefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (path.startsWith(routePrefix)) {
      if (!event.locals.user) {
        throw redirect(303, '/login');
      }
      if (!allowedRoles.includes(event.locals.user.role)) {
        throw redirect(303, '/unauthorized');
      }
    }
  }

  return resolve(event);
};
```

The hooks approach has a significant advantage: there is no way to accidentally expose a route by forgetting to add it to a protected layout group. Every route is protected by default; you explicitly whitelist the public ones. This is the "deny by default" principle from security engineering, and it is the safer approach for applications where data exposure is a serious concern.

## Role-Based Access Control (RBAC)

Most applications need more than "logged in or not." An admin can do things a regular user cannot. A moderator has powers between the two. Here is a complete RBAC system:

```typescript
// src/lib/server/auth/roles.ts

// Define roles as a hierarchy — higher index = more permissions
export const ROLES = ['user', 'moderator', 'admin', 'superadmin'] as const;
export type Role = typeof ROLES[number];

// Permission definitions
export const PERMISSIONS = {
  // Content
  'content:read':    ['user', 'moderator', 'admin', 'superadmin'],
  'content:create':  ['user', 'moderator', 'admin', 'superadmin'],
  'content:update':  ['moderator', 'admin', 'superadmin'],
  'content:delete':  ['admin', 'superadmin'],

  // Users
  'users:read':      ['moderator', 'admin', 'superadmin'],
  'users:update':    ['admin', 'superadmin'],
  'users:delete':    ['superadmin'],
  'users:ban':       ['moderator', 'admin', 'superadmin'],

  // Settings
  'settings:read':   ['admin', 'superadmin'],
  'settings:update': ['superadmin'],

  // Analytics
  'analytics:read':  ['moderator', 'admin', 'superadmin']
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return (allowedRoles as readonly string[]).includes(role);
}

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLES.indexOf(userRole) >= ROLES.indexOf(requiredRole);
}
```

```typescript
// src/lib/server/auth/guards.ts
import { redirect, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { hasPermission, hasRole } from './roles';
import type { Permission, Role } from './roles';

/**
 * Require authentication. Redirects to login if not authenticated.
 */
export function requireAuth(event: RequestEvent) {
  if (!event.locals.user) {
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
  }
  return event.locals.user;
}

/**
 * Require a minimum role level. Throws 403 if insufficient.
 */
export function requireRole(event: RequestEvent, role: Role) {
  const user = requireAuth(event);

  if (!hasRole(user.role, role)) {
    throw error(403, {
      message: `This page requires ${role} access. Your role is ${user.role}.`
    });
  }

  return user;
}

/**
 * Require a specific permission. Throws 403 if not allowed.
 */
export function requirePermission(event: RequestEvent, permission: Permission) {
  const user = requireAuth(event);

  if (!hasPermission(user.role, permission)) {
    throw error(403, {
      message: `You do not have the ${permission} permission.`
    });
  }

  return user;
}
```

Now use these guards in your load functions:

```typescript
// src/routes/(admin)/admin/users/+page.server.ts
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/auth/guards';

export const load: PageServerLoad = async (event) => {
  const user = requirePermission(event, 'users:read');

  const users = await db.select().from(usersTable);

  return {
    user,
    users,
    canEdit: hasPermission(user.role, 'users:update'),
    canDelete: hasPermission(user.role, 'users:delete'),
    canBan: hasPermission(user.role, 'users:ban')
  };
};
```

Passing `canEdit`, `canDelete`, and `canBan` to the component lets the UI adapt to the user's permissions — showing or hiding buttons, enabling or disabling actions — without the component needing to know about the role system.

## Protecting API Routes

API routes need auth protection too, but they return JSON errors instead of redirects:

```typescript
// src/routes/api/users/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasPermission } from '$lib/server/auth/roles';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  if (!hasPermission(locals.user.role, 'users:read')) {
    throw error(403, 'Insufficient permissions');
  }

  const users = await db.select().from(usersTable);
  return json(users);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  if (!hasPermission(locals.user.role, 'users:delete')) {
    throw error(403, 'Only superadmins can delete users');
  }

  // Prevent self-deletion
  if (Number(params.id) === locals.user.id) {
    throw error(400, 'You cannot delete your own account through this endpoint');
  }

  await db.delete(usersTable).where(eq(usersTable.id, Number(params.id)));
  return new Response(null, { status: 204 });
};
```

The key difference from page protection: API routes throw `error()` with status codes (401, 403) instead of using `redirect()`. API clients (fetch calls, mobile apps, third-party integrations) need machine-readable error responses, not redirect instructions.

### Reusable API Auth Middleware

To avoid repeating auth checks in every endpoint, create middleware functions:

```typescript
// src/lib/server/api-middleware.ts
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { hasPermission } from './auth/roles';
import type { Permission } from './auth/roles';

export function apiRequireAuth(event: RequestEvent) {
  if (!event.locals.user) {
    throw error(401, 'Authentication required');
  }
  return event.locals.user;
}

export function apiRequirePermission(event: RequestEvent, permission: Permission) {
  const user = apiRequireAuth(event);
  if (!hasPermission(user.role, permission)) {
    throw error(403, `Requires ${permission} permission`);
  }
  return user;
}

// Rate limiting per user for sensitive endpoints
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function apiRateLimit(event: RequestEvent, maxPerMinute = 10) {
  const user = apiRequireAuth(event);
  const key = `${user.id}:${event.url.pathname}`;
  const now = Date.now();

  const record = rateLimits.get(key);
  if (record && now < record.resetAt) {
    record.count++;
    if (record.count > maxPerMinute) {
      throw error(429, 'Too many requests. Please try again later.');
    }
  } else {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
  }

  return user;
}
```

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
  import { hasPermission } from '$lib/auth/permissions';

  let { data, children } = $props();
</script>

<nav class="flex items-center gap-4 px-6 py-3 border-b">
  <a href="/" class="font-bold text-lg">MyApp</a>

  {#if data.user}
    <a href="/dashboard">Dashboard</a>

    {#if hasPermission(data.user.role, 'analytics:read')}
      <a href="/admin/analytics">Analytics</a>
    {/if}

    {#if hasPermission(data.user.role, 'users:read')}
      <a href="/admin/users">Users</a>
    {/if}

    {#if hasPermission(data.user.role, 'settings:read')}
      <a href="/admin/settings">Settings</a>
    {/if}

    <div class="ml-auto flex items-center gap-3">
      <span class="text-sm text-gray-600">
        {data.user.name}
        {#if data.user.role !== 'user'}
          <span class="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
            {data.user.role}
          </span>
        {/if}
      </span>
      <form method="POST" action="/logout">
        <button type="submit" class="text-sm text-red-600 hover:text-red-800">
          Log Out
        </button>
      </form>
    </div>
  {:else}
    <div class="ml-auto flex items-center gap-3">
      <a href="/login" class="text-sm">Log In</a>
      <a href="/register" class="text-sm bg-blue-600 text-white px-3 py-1.5 rounded">
        Register
      </a>
    </div>
  {/if}
</nav>

<main>
  {@render children()}
</main>
```

Notice that navigation links to admin sections are only visible to users with the appropriate permissions. The nav links for "Analytics," "Users," and "Settings" appear only for users whose roles grant those permissions. This is **progressive disclosure** — users see only what they can act on.

### Client-Side Permission Helpers

Create a client-side permission checker that mirrors the server-side logic (but is never used for actual authorization — that always happens on the server):

```typescript
// src/lib/auth/permissions.ts
// This file runs on BOTH server and client

const PERMISSIONS: Record<string, string[]> = {
  'content:read':    ['user', 'moderator', 'admin', 'superadmin'],
  'content:create':  ['user', 'moderator', 'admin', 'superadmin'],
  'content:update':  ['moderator', 'admin', 'superadmin'],
  'content:delete':  ['admin', 'superadmin'],
  'users:read':      ['moderator', 'admin', 'superadmin'],
  'users:update':    ['admin', 'superadmin'],
  'users:delete':    ['superadmin'],
  'users:ban':       ['moderator', 'admin', 'superadmin'],
  'settings:read':   ['admin', 'superadmin'],
  'settings:update': ['superadmin'],
  'analytics:read':  ['moderator', 'admin', 'superadmin']
};

export function hasPermission(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  return PERMISSIONS[permission]?.includes(role) ?? false;
}
```

**Important:** Client-side permission checks are for UI purposes only. They show or hide buttons, enable or disable form fields, and display appropriate navigation. They do not provide security. A malicious user can bypass any client-side check by modifying JavaScript. Real authorization always happens on the server — in load functions, form actions, and API route handlers.

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
  default: async ({ cookies, locals }) => {
    const sessionId = cookies.get('session');

    if (sessionId) {
      // Delete from database — invalidates the session everywhere
      await db.delete(sessions).where(eq(sessions.id, sessionId));

      // Clear the cookie
      cookies.delete('session', { path: '/' });
    }

    // Clear locals so any remaining code in this request sees no user
    locals.user = null;

    throw redirect(303, '/login');
  }
};
```

Why delete from the database and not just clear the cookie? If you only clear the cookie, the session token is still valid. If the token was stolen (via XSS, network sniffing, or physical access to the browser), the attacker can continue using it. Deleting the session from the database invalidates it everywhere.

### Logout from All Devices

Sometimes users want to log out everywhere (e.g., they suspect their account was compromised):

```typescript
// src/routes/settings/security/+page.server.ts
export const actions: Actions = {
  logoutAll: async ({ locals, cookies }) => {
    if (!locals.user) throw redirect(303, '/login');

    // Delete ALL sessions for this user
    await db.delete(sessions).where(eq(sessions.userId, locals.user.id));

    // Clear the current cookie
    cookies.delete('session', { path: '/' });

    throw redirect(303, '/login');
  }
};
```

## Redirecting Logged-In Users

Prevent logged-in users from seeing the login and register pages — they have no reason to be there:

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
  default: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // ... validate and authenticate ...

    const redirectTo = url.searchParams.get('redirectTo');
    const safeRedirect = redirectTo?.startsWith('/') ? redirectTo : '/dashboard';
    throw redirect(303, safeRedirect);
  }
};
```

## Client-Side Navigation Guards

Server-side checks handle full page loads and form submissions. But SvelteKit's client-side router can navigate between pages without a server request. The `beforeNavigate` hook lets you intercept these client-side navigations:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let { data, children } = $props();

  beforeNavigate(({ to, cancel }) => {
    // If navigating to a protected route without being logged in
    if (to?.url.pathname.startsWith('/dashboard') && !data.user) {
      cancel();
      // You could show a modal or redirect to login
      window.location.href = `/login?redirectTo=${encodeURIComponent(to.url.pathname)}`;
    }
  });
</script>
```

`beforeNavigate` runs on the client during SvelteKit's client-side navigation. It does NOT replace server-side auth checks — if the user manually types a URL or the page is server-rendered, the server load function handles authentication. `beforeNavigate` provides a snappier UX for client-side navigations by catching unauthorized access before the server request.

A practical use case: preventing navigation away from unsaved changes. This is not strictly auth-related, but it uses the same mechanism:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let hasUnsavedChanges = $state(false);

  beforeNavigate(({ cancel }) => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Leave anyway?')) {
        cancel();
      }
    }
  });
</script>
```

## The Auth Context Pattern

For complex applications, wrapping auth data in a Svelte context provides a clean API that any component can consume without prop drilling:

```typescript
// src/lib/auth/context.ts
import { getContext, setContext } from 'svelte';
import { hasPermission } from './permissions';

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

interface AuthContext {
  user: AuthUser | null;
  isAuthenticated: boolean;
  can: (permission: string) => boolean;
  isRole: (role: string) => boolean;
}

const AUTH_KEY = Symbol('auth');

export function setAuthContext(user: AuthUser | null) {
  const context: AuthContext = {
    user,
    isAuthenticated: !!user,
    can: (permission: string) => hasPermission(user?.role, permission),
    isRole: (role: string) => user?.role === role
  };

  setContext(AUTH_KEY, context);
  return context;
}

export function getAuthContext(): AuthContext {
  return getContext<AuthContext>(AUTH_KEY);
}
```

Set the context in your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { setAuthContext } from '$lib/auth/context';

  let { data, children } = $props();

  // Set auth context for all child components
  const auth = setAuthContext(data.user);
</script>

{@render children()}
```

Now any descendant component can check permissions without receiving props:

```svelte
<!-- src/lib/components/DeleteButton.svelte -->
<script lang="ts">
  import { getAuthContext } from '$lib/auth/context';

  interface Props {
    resourceId: number;
    onDelete: (id: number) => void;
  }

  let { resourceId, onDelete }: Props = $props();

  const auth = getAuthContext();
</script>

{#if auth.can('content:delete')}
  <button
    onclick={() => onDelete(resourceId)}
    class="text-red-600 hover:text-red-800 text-sm"
  >
    Delete
  </button>
{/if}
```

```svelte
<!-- src/lib/components/AdminBadge.svelte -->
<script lang="ts">
  import { getAuthContext } from '$lib/auth/context';

  const auth = getAuthContext();
</script>

{#if auth.isAuthenticated}
  <span class="text-sm">
    Welcome, {auth.user?.name}
    {#if auth.isRole('admin') || auth.isRole('superadmin')}
      <span class="ml-1 bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-xs">
        Admin
      </span>
    {/if}
  </span>
{/if}
```

The context pattern centralizes auth logic. Instead of every component independently checking `data.user?.role === 'admin'`, they call `auth.can('content:delete')`. If you rename a role or restructure your permission system, you change it in one place.

## Custom Error Pages for Auth Failures

Create friendly error pages for 401 and 403 responses:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

{#if page.status === 401}
  <div class="text-center py-20">
    <h1 class="text-4xl font-bold mb-4">Not Logged In</h1>
    <p class="text-gray-600 mb-8">
      You need to log in to access this page.
    </p>
    <a
      href="/login?redirectTo={encodeURIComponent(page.url.pathname)}"
      class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
    >
      Log In
    </a>
  </div>
{:else if page.status === 403}
  <div class="text-center py-20">
    <h1 class="text-4xl font-bold mb-4">Access Denied</h1>
    <p class="text-gray-600 mb-8">
      You do not have permission to view this page.
      {#if page.error?.message}
        <br />{page.error.message}
      {/if}
    </p>
    <a
      href="/dashboard"
      class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
    >
      Go to Dashboard
    </a>
  </div>
{:else}
  <div class="text-center py-20">
    <h1 class="text-4xl font-bold mb-4">{page.status}</h1>
    <p class="text-gray-600 mb-8">{page.error?.message || 'Something went wrong'}</p>
    <a href="/" class="text-blue-600 hover:underline">Go Home</a>
  </div>
{/if}
```

## Session Expiration and Refresh

Sessions should expire. An eternal session is a security risk — if the token is compromised, the attacker has access forever. Implement session expiration with automatic refresh:

```typescript
// src/hooks.server.ts — session refresh logic
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      event.cookies.delete('session', { path: '/' });
    } else if (session.expiresAt < new Date()) {
      // Session expired — clean up
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      event.cookies.delete('session', { path: '/' });
    } else {
      // Session valid — load user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId));

      event.locals.user = user || null;

      // Sliding expiration: extend session if more than halfway through
      const totalDuration = session.expiresAt.getTime() - session.createdAt.getTime();
      const remaining = session.expiresAt.getTime() - Date.now();

      if (remaining < totalDuration / 2) {
        const newExpiry = new Date(Date.now() + totalDuration);
        await db
          .update(sessions)
          .set({ expiresAt: newExpiry })
          .where(eq(sessions.id, sessionId));

        event.cookies.set('session', sessionId, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          expires: newExpiry
        });
      }
    }
  }

  return resolve(event);
};
```

The sliding expiration pattern extends the session when the user is actively using the application. If a session lasts 7 days and the user visits after 4 days, the session extends to 7 days from now. An inactive user's session expires naturally.

## Try It

1. **Set up a complete multi-role auth system** with route groups:
   - `(public)` — homepage, about, pricing, login, register
   - `(protected)` — dashboard, settings, profile
   - `(admin)` — admin panel, user management, analytics
   - Implement guards that redirect to login (for unauthenticated) or show a 403 error (for insufficient permissions)

2. **Build the auth context pattern.** Create `setAuthContext` and `getAuthContext` functions. Set the context in your root layout. Create a `<DeleteButton>` component that only renders if the user has the `content:delete` permission. Create an `<AdminBadge>` component that shows a badge next to the user's name if they have admin privileges.

3. **Implement login with redirect-back.** When an unauthenticated user visits `/dashboard/settings`, redirect to `/login?redirectTo=%2Fdashboard%2Fsettings`. After successful login, redirect to the original URL. Add a security check to ensure the `redirectTo` parameter is a local path.

4. **Add session expiration** with sliding window refresh. Sessions last 7 days. If a user visits when more than half the session duration has elapsed, extend it. Clean up expired sessions on each request.

## Key Takeaways

- Check `locals.user` in load functions and `throw redirect(303, '/login')` for unauthenticated users — 303 guarantees a GET redirect
- Use route groups like `(protected)` with a layout load function to guard multiple pages with a single auth check
- For "deny by default" security, check auth in hooks and whitelist public routes explicitly
- Role-based access control maps roles to permissions — check permissions in load functions and form actions, never just in the UI
- API routes return `error(401)` or `error(403)` instead of redirects — API clients need status codes, not redirect instructions
- Pass user data from the root layout so all components can adjust their UI through the auth context pattern
- Client-side permission checks (context, `beforeNavigate`) are for UX only — real authorization always happens on the server
- Preserve the user's intended destination with a `redirectTo` query parameter, but always validate it is a local path to prevent open redirect attacks
- Sessions should expire with sliding window refresh — eternal sessions are a security liability
- Logout must delete the session from the database, not just clear the cookie — otherwise stolen tokens remain valid
