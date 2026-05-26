# Implementing Authentication

Now you will build a complete authentication system in SvelteKit from scratch. This covers user registration with password hashing, session management with database-backed sessions, login and logout flows, the `handle` hook for making the current user available everywhere, OAuth (GitHub) integration step by step, protecting routes with server-side guards, and the security considerations that matter in production.

Authentication is the most security-critical feature in any web application. Every decision -- how you hash passwords, how you store sessions, how you validate input -- has security implications. This lesson explains not just the "how" but the "why" behind every choice.

## Database Schema

Start with tables for users and sessions:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),       // Null for OAuth-only users
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  provider: text('provider').default('email'), // 'email', 'github', 'google'
  providerId: text('provider_id'),             // External ID from OAuth provider
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),               // UUIDv4
  userId: integer('user_id').notNull().references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  userAgent: text('user_agent'),             // For "active sessions" UI
  ipAddress: text('ip_address')              // For security auditing
});
```

Run `npx drizzle-kit push` to create these tables.

The schema separates `passwordHash` (nullable) from the `provider` field. This allows users to sign up via OAuth without a password, and later add a password if they want email login too. The `providerId` stores the external user ID from GitHub/Google, which you need to look up existing accounts on subsequent OAuth logins.

Sessions store `userAgent` and `ipAddress` for two reasons: security auditing (detecting suspicious logins) and the "active sessions" feature that lets users see where they are logged in and revoke sessions.

## Type Declarations

Tell TypeScript about the user on `event.locals`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: {
        id: number;
        email: string;
        name: string;
        avatarUrl: string | null;
      } | null;
    }
  }
}

export {};
```

Making `user` always present (but nullable) is better than making it optional (`user?`). With an optional property, every access requires `event.locals.user?.id`. With a nullable property, you check once (`if (!user)`) and then use it confidently.

## Session Helpers

Extract session creation and validation into reusable functions:

```typescript
// src/lib/server/auth.ts
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import type { Cookies, RequestEvent } from '@sveltejs/kit';

const SESSION_DURATION_DAYS = 30;
const COOKIE_NAME = 'session';

/**
 * Create a new session for a user. Sets the session cookie.
 */
export async function createSession(
  userId: number,
  cookies: Cookies,
  event?: RequestEvent
): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    userAgent: event?.request.headers.get('user-agent') ?? null,
    ipAddress: event?.getClientAddress() ?? null
  });

  cookies.set(COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,           // JavaScript cannot read this cookie
    secure: true,             // Only sent over HTTPS
    sameSite: 'lax',          // Sent on top-level navigations, not cross-site requests
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
  });

  return sessionId;
}

/**
 * Look up a session and return the associated user.
 * Returns null if the session is invalid or expired.
 */
export async function validateSession(
  sessionId: string
): Promise<{
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
} | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date().toISOString())
      )
    )
    .limit(1);

  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

/**
 * Delete a session (logout).
 */
export async function deleteSession(sessionId: string, cookies: Cookies) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  cookies.delete(COOKIE_NAME, { path: '/' });
}

/**
 * Delete all sessions for a user except the current one.
 * Used for "log out everywhere" or after password change.
 */
export async function deleteOtherSessions(userId: number, currentSessionId: string) {
  await db.delete(sessions).where(
    and(
      eq(sessions.userId, userId),
      // Keep the current session
      // Note: Drizzle does not have "not equals" shorthand, use sql``
    )
  );
}
```

Cookie flags explained:
- **`httpOnly`**: The cookie is invisible to `document.cookie` in JavaScript. This prevents XSS attacks from stealing session tokens.
- **`secure`**: The cookie is only sent over HTTPS connections. This prevents session tokens from being intercepted on unencrypted networks.
- **`sameSite: 'lax'`**: The cookie is sent on top-level navigations (clicking a link to your site) but not on cross-site form submissions or embedded requests. This prevents CSRF attacks while still allowing bookmarked links and email links to work.
- **`path: '/'`**: The cookie is sent for all routes, not just the route that set it.

## Registration Flow

Create the registration page with validation, password hashing, and immediate login:

```typescript
// src/routes/register/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession } from '$lib/server/auth';

// Redirect if already logged in
export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(303, '/dashboard');
};

export const actions: Actions = {
  default: async (event) => {
    const { request, cookies } = event;
    const formData = await request.formData();
    const email = (formData.get('email') as string)?.toLowerCase().trim();
    const password = formData.get('password') as string;
    const name = (formData.get('name') as string)?.trim();

    // --- Validation ---
    const errors: Record<string, string> = {};

    if (!email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email address';
    }

    if (!name || name.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (password.length > 72) {
      // bcrypt silently truncates at 72 bytes
      errors.password = 'Password cannot exceed 72 characters';
    } else if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one uppercase letter and one number';
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors, email, name });
    }

    // --- Check for existing user ---
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return fail(400, {
        errors: { email: 'An account with this email already exists' },
        email,
        name
      });
    }

    // --- Create user ---
    const passwordHash = await bcrypt.hash(password, 12);
    // Cost factor 12 takes ~250ms on modern hardware.
    // Cost factor 10 (~100ms) is acceptable. Never go below 10.

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name, provider: 'email' })
      .returning();

    // --- Create session and redirect ---
    await createSession(user.id, cookies, event);
    throw redirect(303, '/dashboard');
  }
};
```

The registration form component:

```svelte
<!-- src/routes/register/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
</script>

<div class="max-w-md mx-auto mt-16 p-6">
  <h1 class="text-2xl font-bold mb-6">Create an Account</h1>

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
    <div>
      <label for="name" class="block text-sm font-medium mb-1">Name</label>
      <input
        id="name"
        name="name"
        type="text"
        value={form?.name ?? ''}
        required
        class="w-full border rounded px-3 py-2"
        aria-describedby={form?.errors?.name ? 'name-error' : undefined}
      />
      {#if form?.errors?.name}
        <p id="name-error" class="text-red-500 text-sm mt-1">{form.errors.name}</p>
      {/if}
    </div>

    <div>
      <label for="email" class="block text-sm font-medium mb-1">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        value={form?.email ?? ''}
        required
        class="w-full border rounded px-3 py-2"
        autocomplete="email"
        aria-describedby={form?.errors?.email ? 'email-error' : undefined}
      />
      {#if form?.errors?.email}
        <p id="email-error" class="text-red-500 text-sm mt-1">{form.errors.email}</p>
      {/if}
    </div>

    <div>
      <label for="password" class="block text-sm font-medium mb-1">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minlength="8"
        class="w-full border rounded px-3 py-2"
        autocomplete="new-password"
        aria-describedby={form?.errors?.password ? 'password-error' : undefined}
      />
      {#if form?.errors?.password}
        <p id="password-error" class="text-red-500 text-sm mt-1">{form.errors.password}</p>
      {/if}
      <p class="text-gray-400 text-xs mt-1">
        At least 8 characters, one uppercase letter, one number
      </p>
    </div>

    <button
      type="submit"
      disabled={submitting}
      class="w-full bg-black text-white py-2.5 rounded font-medium
             hover:bg-gray-800 disabled:opacity-50 transition-colors"
    >
      {submitting ? 'Creating account...' : 'Create Account'}
    </button>
  </form>

  <p class="text-center text-sm text-gray-500 mt-6">
    Already have an account?
    <a href="/login" class="text-blue-600 hover:underline">Log in</a>
  </p>

  <div class="relative my-6">
    <div class="absolute inset-0 flex items-center">
      <div class="w-full border-t"></div>
    </div>
    <div class="relative flex justify-center text-sm">
      <span class="bg-white px-2 text-gray-500">or continue with</span>
    </div>
  </div>

  <a
    href="/auth/github"
    class="flex items-center justify-center gap-2 w-full border rounded py-2.5
           hover:bg-gray-50 transition-colors"
  >
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
    Continue with GitHub
  </a>
</div>
```

## Login Flow

Login finds the user, verifies the password, and creates a session:

```typescript
// src/routes/login/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) throw redirect(303, '/dashboard');

  return {
    // Pass through the redirect target (e.g., /login?redirect=/settings)
    redirectTo: url.searchParams.get('redirect') ?? '/dashboard'
  };
};

export const actions: Actions = {
  default: async (event) => {
    const { request, cookies, url } = event;
    const formData = await request.formData();
    const email = (formData.get('email') as string)?.toLowerCase().trim();
    const password = formData.get('password') as string;
    const redirectTo = url.searchParams.get('redirect') ?? '/dashboard';

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      // User does not exist OR is an OAuth-only user
      // Use the same error message for both cases to prevent account enumeration
      return fail(400, { error: 'Invalid email or password', email });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    // Create session
    await createSession(user.id, cookies, event);

    // Validate the redirect target to prevent open redirect attacks
    const safeRedirect = redirectTo.startsWith('/') && !redirectTo.startsWith('//')
      ? redirectTo
      : '/dashboard';

    throw redirect(303, safeRedirect);
  }
};
```

**Critical security detail**: The error message says "Invalid email or password" for both wrong email and wrong password. This prevents **account enumeration** -- an attacker cannot discover which email addresses are registered by trying different emails and observing different error messages. The login function should be indistinguishable in behavior whether the email exists or not.

**Open redirect protection**: The `redirectTo` parameter is validated to ensure it starts with `/` and does not start with `//`. Without this check, an attacker could craft a link like `/login?redirect=//evil.com` that redirects the user to a malicious site after login.

## Logout Flow

Logout deletes the session from the database and clears the cookie:

```typescript
// src/routes/logout/+page.server.ts
import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/auth';

export const actions: Actions = {
  default: async ({ cookies }) => {
    const sessionId = cookies.get('session');
    if (sessionId) {
      await deleteSession(sessionId, cookies);
    }
    throw redirect(303, '/login');
  }
};
```

Use a form (not a link) for logout:

```svelte
<form method="POST" action="/logout">
  <button type="submit">Log Out</button>
</form>
```

Why a form? Logout is a state-changing operation. Using a GET request (a link) for state changes is dangerous: browser prefetching, link preloading, and crawlers can trigger it accidentally. A POST form requires intentional submission.

## The Auth Hook

Use `hooks.server.ts` to look up the current user on every request. This is the foundation of authentication in SvelteKit:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  // Default to null -- unauthenticated
  event.locals.user = null;

  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await validateSession(sessionId);
    event.locals.user = user;
  }

  return resolve(event);
};
```

This hook runs on **every single request** -- page loads, form submissions, API calls, everything. After this hook, `event.locals.user` is available in:
- All `+page.server.ts` load functions
- All `+layout.server.ts` load functions
- All form actions
- All `+server.ts` API handlers

## Making the User Available to the Client

Pass the user from `event.locals` to the client through a root layout load function:

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  let { data, children } = $props();
</script>

<!-- The user is now available in data.user across the entire app -->
<nav>
  {#if data.user}
    <span>Welcome, {data.user.name}</span>
    <form method="POST" action="/logout" class="inline">
      <button type="submit">Log Out</button>
    </form>
  {:else}
    <a href="/login">Log In</a>
    <a href="/register">Sign Up</a>
  {/if}
</nav>

{@render children()}
```

## Protecting Routes

There are two approaches to protecting routes: in each load function, or with a layout-level guard.

### Approach 1: Per-Route Protection

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Preserve the intended destination
    throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return {
    // Fetch user-specific data
    user: locals.user
  };
};
```

### Approach 2: Layout-Level Guard

Protect an entire route group by adding a guard to a layout:

```typescript
// src/routes/(protected)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return {
    user: locals.user
  };
};
```

Now any route under `src/routes/(protected)/` is automatically guarded. Put your dashboard, settings, profile, and other authenticated pages in this group:

```
src/routes/
  (protected)/
    +layout.server.ts    ← Guard -- redirects if not logged in
    dashboard/
      +page.svelte
    settings/
      +page.svelte
    profile/
      +page.svelte
  (public)/
    +layout.svelte
    login/
      +page.svelte
    register/
      +page.svelte
```

## OAuth: GitHub Authentication Step by Step

OAuth allows users to log in with their existing accounts (GitHub, Google, etc.) without creating a password. The flow is:

```
1. User clicks "Continue with GitHub"
2. Your server redirects to GitHub's authorization URL
3. User authorizes your app on GitHub
4. GitHub redirects back to your callback URL with a code
5. Your server exchanges the code for an access token
6. Your server fetches the user's profile from GitHub
7. Your server creates/finds the user and creates a session
```

### Setting Up GitHub OAuth

1. Go to GitHub Settings > Developer settings > OAuth Apps > New OAuth App
2. Set the callback URL to `http://localhost:5173/auth/github/callback` (and your production URL)
3. Copy the Client ID and Client Secret to your `.env`:

```bash
# .env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### Step 1: Redirect to GitHub

```typescript
// src/routes/auth/github/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_CLIENT_ID } from '$env/static/private';

export const GET: RequestHandler = async ({ cookies }) => {
  // Generate a random state parameter to prevent CSRF attacks
  const state = crypto.randomUUID();
  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: 'http://localhost:5173/auth/github/callback',
    scope: 'read:user user:email',
    state
  });

  throw redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
```

The `state` parameter is critical for security. Without it, an attacker could initiate an OAuth flow, get a GitHub code, and trick your user into visiting your callback URL with the attacker's code -- linking the attacker's GitHub account to the victim's account. The state parameter ensures the callback is responding to a request your server initiated.

### Step 2: Handle the Callback

```typescript
// src/routes/auth/github/callback/+server.ts
import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '$env/static/private';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '$lib/server/auth';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export const GET: RequestHandler = async (event) => {
  const { url, cookies } = event;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = cookies.get('oauth_state');

  // Validate the state parameter
  if (!code || !state || state !== savedState) {
    throw error(400, 'Invalid OAuth state. Please try again.');
  }

  // Clean up the state cookie
  cookies.delete('oauth_state', { path: '/' });

  // Exchange the code for an access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    })
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    throw error(400, `GitHub OAuth error: ${tokenData.error_description}`);
  }

  const accessToken = tokenData.access_token;

  // Fetch the user's profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json'
    }
  });

  const githubUser: GitHubUser = await userResponse.json();

  // Fetch the user's email (may not be public on their profile)
  let email = githubUser.email;

  if (!email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json'
      }
    });

    const emails: GitHubEmail[] = await emailResponse.json();
    const primaryEmail = emails.find(e => e.primary && e.verified);
    email = primaryEmail?.email ?? emails.find(e => e.verified)?.email ?? null;
  }

  if (!email) {
    throw error(400, 'Could not retrieve your email from GitHub. Please make sure you have a verified email.');
  }

  // Find or create the user in your database
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    // Existing user -- update their GitHub info
    await db
      .update(users)
      .set({
        avatarUrl: githubUser.avatar_url,
        provider: user.provider === 'email' ? 'email' : 'github', // Do not overwrite if they have a password
        providerId: String(githubUser.id)
      })
      .where(eq(users.id, user.id));
  } else {
    // New user -- create their account
    [user] = await db
      .insert(users)
      .values({
        email,
        name: githubUser.name ?? githubUser.login,
        avatarUrl: githubUser.avatar_url,
        provider: 'github',
        providerId: String(githubUser.id)
      })
      .returning();
  }

  // Create session and redirect
  await createSession(user.id, cookies, event);
  throw redirect(303, '/dashboard');
};
```

## Session Management: Advanced Patterns

### Session Rotation

After login, rotate the session to prevent session fixation attacks:

```typescript
// In your login action, after verifying the password:

// Delete the old session if one exists
const existingSessionId = cookies.get('session');
if (existingSessionId) {
  await deleteSession(existingSessionId, cookies);
}

// Create a fresh session
await createSession(user.id, cookies, event);
```

Session fixation works like this: an attacker sets a known session cookie on the victim's browser, then waits for the victim to log in. If the session ID does not change on login, the attacker now has a valid session for the victim's account. Rotating the session on login prevents this.

### Session Sliding Expiry

Extend the session on every request so active users are never logged out:

```typescript
// In hooks.server.ts, after validating the session:
if (session) {
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const halfLife = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000 / 2;

  // If more than half the session duration has passed, extend it
  if (expiresAt.getTime() - now.getTime() < halfLife) {
    const newExpiry = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry.toISOString() })
      .where(eq(sessions.id, sessionId));

    cookies.set(COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
    });
  }
}
```

This way, a user who logs in and uses the site daily is never forced to re-authenticate. But an abandoned session expires after the full duration. Extending at the half-life (instead of every request) reduces database writes.

### Expired Session Cleanup

Sessions accumulate. Clean them up:

```typescript
// Run daily via cron job or maintenance endpoint
async function cleanExpiredSessions() {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date().toISOString()));

  console.log('Cleaned expired sessions');
}
```

## Security Considerations

### Password Security

```typescript
// bcrypt cost factors:
// 10 = ~100ms per hash (minimum acceptable)
// 12 = ~250ms per hash (recommended)
// 14 = ~1s per hash (high security)

// bcrypt has a 72-byte limit. Passwords longer than 72 bytes are silently truncated.
// For most users this is fine (72 bytes = 72 ASCII characters).
// If you need to support longer passwords, pre-hash with SHA-256:

import { createHash } from 'crypto';

function prehash(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

const hash = await bcrypt.hash(prehash(password), 12);
const valid = await bcrypt.compare(prehash(password), hash);
```

### Rate Limiting Login Attempts

```typescript
// src/lib/server/rate-limit.ts
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (!entry || entry.blockedUntil < now) {
    loginAttempts.set(ip, { count: 1, blockedUntil: 0 });
    return { allowed: true };
  }

  entry.count++;

  if (entry.count > 5) {
    // Block for 15 minutes after 5 failed attempts
    entry.blockedUntil = now + 15 * 60 * 1000;
    return { allowed: false, retryAfter: 900 };
  }

  return { allowed: true };
}

// Call this on successful login to reset the counter
export function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}
```

Use it in the login action:

```typescript
const ip = event.getClientAddress();
const rateLimit = checkLoginRateLimit(ip);

if (!rateLimit.allowed) {
  return fail(429, {
    error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`,
    email
  });
}

// ... verify credentials ...

if (!valid) {
  // Do not reset -- failed attempts accumulate
  return fail(400, { error: 'Invalid email or password', email });
}

// Successful login -- reset the counter
resetLoginRateLimit(ip);
```

### Timing-Safe Comparison

The `bcrypt.compare` function is already timing-safe (it takes the same amount of time regardless of whether the password matches). But if you ever compare strings directly (e.g., API keys), use `crypto.timingSafeEqual` to prevent timing attacks:

```typescript
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

## Try It

1. Build the complete registration and login pages with forms that submit to the actions above. Add proper validation, error display, and use `use:enhance` for smooth submissions without full page reloads. Test the flow: register, get redirected, check that the session cookie exists in dev tools.

2. Implement the GitHub OAuth flow. Create a GitHub OAuth App, set up the redirect and callback endpoints, and test logging in with GitHub. Verify that subsequent logins find the existing user instead of creating a duplicate.

3. Add a "Settings" page where users can view their active sessions (device, IP, last used) and revoke individual sessions. Show the current session with a "This device" label.

4. Implement a password change feature that requires the current password, validates the new password, and invalidates all other sessions after the change.

## Key Takeaways

- Hash passwords with `bcrypt.hash()` at cost factor 12 and verify with `bcrypt.compare()` -- never store plaintext passwords
- Create sessions with `crypto.randomUUID()` and store them in the database with an expiry timestamp
- Set session cookies with `httpOnly`, `secure`, and `sameSite: 'lax'` flags to prevent XSS and CSRF attacks
- The `handle` hook in `hooks.server.ts` runs on every request and is the right place to look up the current user via `event.locals`
- Always return the same error message for wrong email and wrong password to prevent account enumeration
- Validate redirect URLs to prevent open redirect attacks -- ensure they start with `/` and not `//`
- OAuth requires a state parameter to prevent CSRF, and you must fetch the user's email separately (it may not be public)
- Rotate sessions on login to prevent session fixation attacks
- Rate limit login attempts by IP address to prevent brute-force attacks
- Use layout-level guards with route groups to protect entire sections of your app
- Use `throw redirect(303, '/path')` after successful login, registration, or logout
- Clean up expired sessions periodically to prevent database bloat
