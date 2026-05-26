# Authentication Concepts

Before you write a single line of auth code, you need a mental model for what authentication actually is and how it fits into a web application. Getting this wrong has real consequences -- leaked passwords, session hijacking, unauthorized access to user data. This is not a feature you can "get mostly right." Authentication is binary: it is either secure or it is not. A single mishandled cookie flag, a forgotten authorization check, or a weak hashing algorithm can compromise every user account in your system.

This module gives you the foundational concepts so that when you implement auth in SvelteKit, you understand _why_ each piece exists. We will go deep on the mechanisms -- session vs token tradeoffs, OAuth protocol flow, password hashing internals, cookie security, and CSRF attacks -- because understanding the "why" is the only defense against the "I did not know that could happen" bugs that make front-page news.

## Authentication vs Authorization

These two words sound similar but represent fundamentally different questions:

- **Authentication** answers "Who are you?" -- verifying a user's identity
- **Authorization** answers "What are you allowed to do?" -- determining permissions

You must authenticate first, then authorize. They happen in sequence but are separate concerns. A common architecture mistake is tangling them together. Keep them distinct in your code and your thinking.

```
Authentication:  "This request is from user Alice (verified by session cookie)"
Authorization:   "Alice has the 'editor' role, so she can edit posts but not delete users"
```

In practice, authentication happens once (at login) and is remembered via a session or token. Authorization happens on every request -- checking whether the authenticated user has permission to perform the requested action.

A real-world analogy: authentication is showing your ID at the airport. Authorization is whether your boarding pass lets you into the first-class lounge. Having a valid ID does not mean you can go everywhere.

### Why Separation Matters Architecturally

```typescript
// WRONG: Authentication and authorization tangled together
export const load: PageServerLoad = async ({ cookies }) => {
  const sessionId = cookies.get('session');
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  const user = await db.select().from(users).where(eq(users.id, session?.userId)).get();

  if (!user || user.role !== 'admin') {
    throw redirect(303, '/login');
  }
  // Problem: Is the user not logged in, or just not an admin?
  // Both cases redirect to /login, which is wrong for an authenticated non-admin.
};

// CORRECT: Authentication and authorization as separate steps
export const load: PageServerLoad = async ({ locals }) => {
  // Step 1: Authentication (already done in hooks.server.ts)
  if (!locals.user) {
    throw redirect(303, '/login'); // Not authenticated
  }

  // Step 2: Authorization (checked per-route)
  if (locals.user.role !== 'admin') {
    throw error(403, 'You do not have permission to view this page');
  }

  // Step 3: Load data for authorized user
  return { users: await getAdminDashboardData() };
};
```

Separating these concerns means you handle "not logged in" differently from "not authorized." A non-authenticated user gets redirected to login. A non-authorized user gets a 403 error. Conflating them creates confusing user experiences and security gaps.

### Authorization Models: RBAC and Beyond

Role-Based Access Control (RBAC) is the most common authorization model. Users have roles, roles have permissions:

```typescript
// Simple RBAC
type Role = 'admin' | 'editor' | 'viewer';

const permissions: Record<Role, string[]> = {
  admin: ['read', 'write', 'delete', 'manage_users'],
  editor: ['read', 'write'],
  viewer: ['read'],
};

function canPerform(role: Role, action: string): boolean {
  return permissions[role]?.includes(action) ?? false;
}

// In a server action:
if (!canPerform(locals.user.role, 'delete')) {
  throw error(403, 'You do not have permission to delete posts');
}
```

For more complex applications, you might need Attribute-Based Access Control (ABAC), where permissions depend on the relationship between the user and the resource ("editors can only edit their own posts"), but RBAC handles the vast majority of cases.

## Session-Based Authentication

Session-based auth is the traditional model and still the most secure default for server-rendered apps like SvelteKit. Here is the complete flow:

```
  1. User submits email + password via a form
  2. Server finds the user record in the database
  3. Server hashes the submitted password and compares it to the stored hash
  4. If they match, the server creates a session record in the database
  5. Server sends a Set-Cookie header with the session ID
  6. Browser stores the cookie automatically
  7. On every subsequent request, the browser sends the cookie
  8. Server reads the cookie, looks up the session, and identifies the user
```

The key architectural insight is that the **server holds the truth**. The session record lives on the server. The cookie is just a reference -- an opaque identifier that means nothing on its own. This is why session-based auth is inherently more secure than token-based auth for most web apps: the server can revoke a session instantly by deleting the record.

### Session Creation in Detail

```typescript
// Simplified session creation in a SvelteKit form action
import { randomBytes } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/db/schema';

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Step 1: Find the user
    const user = db.select().from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .get();

    // Step 2: Verify password (same error for both cases -- prevents enumeration)
    if (!user || !(await verify(user.passwordHash, password))) {
      return fail(401, { error: 'Invalid email or password' });
    }

    // Step 3: Create session
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    }).run();

    // Step 4: Set cookie
    cookies.set('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    throw redirect(303, '/dashboard');
  }
};
```

### Why the Same Error Message?

Notice that the login code returns the same error for "user not found" and "wrong password":

```typescript
// WRONG: Different errors reveal which users exist
if (!user) return fail(401, { error: 'User not found' });
if (!(await verify(user.passwordHash, password))) {
  return fail(401, { error: 'Wrong password' });
}
// An attacker can enumerate valid email addresses by testing which error they get.
// "User not found" → this email is not registered (move on)
// "Wrong password" → this email IS registered (target this account)

// CORRECT: Same error for both cases
if (!user || !(await verify(user.passwordHash, password))) {
  return fail(401, { error: 'Invalid email or password' });
}
// Attacker learns nothing about which part was wrong.
```

This is called preventing **user enumeration**. It seems like a small thing, but it is the difference between an attacker knowing which accounts exist (and can be targeted for password spraying) versus guessing blindly.

### Session Validation in Hooks

The real power of sessions in SvelteKit is that you validate them in `hooks.server.ts`, which runs on every request:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    // Find the session and check it has not expired
    const result = db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        role: users.role,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          gt(sessions.expiresAt, new Date().toISOString())
        )
      )
      .get();

    if (result) {
      event.locals.user = {
        id: result.userId,
        email: result.email,
        role: result.role,
      };
    } else {
      // Session expired or invalid -- clear the cookie
      event.cookies.delete('session', { path: '/' });
    }
  }

  return resolve(event);
};
```

After this hook runs, every load function, form action, and API endpoint can check `event.locals.user` without repeating the session validation logic. This is the "cross-cutting concern" pattern in action.

### Session Table Schema

Here is how you define the sessions table in Drizzle:

```typescript
// src/lib/server/db/schema.ts
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),          // Random hex string, not auto-increment
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});
```

Note that the session ID is a random string, not an auto-incrementing integer. Auto-incrementing IDs are predictable -- an attacker who discovers session ID 1000 can guess that sessions 999 and 1001 exist. Random 32-byte hex strings (64 characters) have 2^128 possible values, making guessing computationally infeasible.

## Token-Based Authentication (JWT)

JSON Web Tokens (JWTs) take a different approach: instead of storing session data on the server, the token _itself_ contains the user's identity and claims, signed with a secret key.

```
Header:    { "alg": "HS256", "typ": "JWT" }
Payload:   { "sub": "user_123", "role": "admin", "exp": 1700000000 }
Signature: HMAC-SHA256(header + payload, secret)
```

The server creates and signs the token at login. On subsequent requests, the client sends the token (usually in an `Authorization` header), and the server verifies the signature without needing to look anything up in a database.

### The Fundamental Problem with JWTs for Web Apps

**Tradeoffs vs sessions:**

| Aspect | Sessions | JWTs |
|--------|----------|------|
| Storage | Server-side (DB/Redis) | Client-side (cookie/localStorage) |
| Revocation | Delete the session record -- instant | Cannot revoke until expiry (without a blocklist) |
| Scalability | Requires shared session store across servers | Stateless -- any server can verify |
| Size | Cookie is tiny (just an ID) | Token can be large (contains claims) |
| Security | Harder to misuse | Easy to store insecurely (localStorage = XSS risk) |

The inability to revoke JWTs is their fundamental weakness. If a user's account is compromised, you cannot invalidate their token -- you have to wait for it to expire or maintain a server-side blocklist, which defeats the "stateless" benefit.

```
# WRONG mental model: "JWTs are more modern than sessions"
# They are not "more modern." They solve a different problem.
# JWTs are for stateless service-to-service authentication
# where you cannot afford a database lookup on every request.

# CORRECT mental model: "Sessions for web apps, JWTs for APIs"
# A SvelteKit app can look up a session in the database on every
# request -- it is already talking to a database for other things.
# The "stateless" benefit of JWTs has no value here.
# Sessions give you instant revocation, which JWTs cannot.
```

For most SvelteKit apps, session-based auth is the better default. JWTs make sense for mobile API backends, microservice communication, and scenarios where you truly cannot maintain server-side state.

## OAuth: "Sign in with Google" Demystified

OAuth lets users authenticate with a third-party provider (Google, GitHub, etc.) instead of creating a password on your site. The redirect flow works like this:

```
  1. User clicks "Sign in with Google" on your app

  2. Your app redirects the user to Google's authorization page
     URL: https://accounts.google.com/o/oauth2/auth?
          client_id=YOUR_ID&
          redirect_uri=https://yourapp.com/auth/callback&
          scope=openid+email+profile&
          state=RANDOM_STATE_VALUE

  3. User logs in to Google (if not already) and approves your app

  4. Google redirects back to your app with an authorization code
     URL: https://yourapp.com/auth/callback?
          code=AUTHORIZATION_CODE&
          state=RANDOM_STATE_VALUE

  5. Your SERVER exchanges that code for an access token (server-to-server)
     POST https://oauth2.googleapis.com/token
     Body: { code, client_id, client_secret, redirect_uri, grant_type }

  6. Your server uses the access token to fetch the user's profile
     GET https://www.googleapis.com/oauth2/v2/userinfo
     Header: Authorization: Bearer ACCESS_TOKEN

  7. Your server creates or finds a local user record and starts a SESSION
```

The critical security detail: the authorization code exchange (step 5) happens server-to-server. Your client secret never touches the browser. This is why OAuth callbacks must hit a server endpoint, not a client-side route.

### The State Parameter: Preventing CSRF in OAuth

The `state` parameter in step 2 is a security measure you must not skip:

```typescript
// Generate a random state value and store it in a cookie
const state = randomBytes(16).toString('hex');
cookies.set('oauth_state', state, {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 10 // 10 minutes
});

// Include state in the authorization URL
const authUrl = `https://accounts.google.com/o/oauth2/auth?state=${state}&...`;

// In the callback, verify the state matches
const callbackState = url.searchParams.get('state');
const storedState = cookies.get('oauth_state');
if (callbackState !== storedState) {
  throw error(403, 'Invalid state parameter -- possible CSRF attack');
}
```

Without the state parameter, an attacker could initiate an OAuth flow on your behalf and link their Google account to your session. The state parameter ensures that the callback you receive corresponds to a flow you initiated.

### Account Linking: A Subtle Problem

What happens when a user signs in with Google, and later tries to sign in with the same email using a password? Or vice versa?

```typescript
// In your OAuth callback handler
const googleUser = await getGoogleProfile(accessToken);

// Check if a user with this email already exists
const existingUser = db.select().from(users)
  .where(eq(users.email, googleUser.email))
  .get();

if (existingUser) {
  // User exists -- link the OAuth account to the existing user
  db.insert(oauthAccounts).values({
    provider: 'google',
    providerUserId: googleUser.id,
    userId: existingUser.id,
  }).run();

  return createSessionAndRedirect(existingUser.id, cookies);
} else {
  // New user -- create account and OAuth link
  const newUser = db.insert(users).values({
    email: googleUser.email,
    displayName: googleUser.name,
  }).returning().get();

  db.insert(oauthAccounts).values({
    provider: 'google',
    providerUserId: googleUser.id,
    userId: newUser.id,
  }).run();

  return createSessionAndRedirect(newUser.id, cookies);
}
```

After the OAuth flow completes, you typically create a normal session for the user. OAuth replaces the "verify password" step -- the rest of your auth system (sessions, cookies, authorization) works the same way.

### OAuth Schema Design

Your database schema must support multiple auth providers per user:

```typescript
export const oauthAccounts = sqliteTable('oauth_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),           // 'google', 'github', etc.
  providerUserId: text('provider_user_id').notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
}, (table) => ({
  // One account per provider per user
  uniqueProvider: uniqueIndex('oauth_provider_unique')
    .on(table.provider, table.providerUserId),
}));
```

## Password Hashing: Why and How

The most important rule: **never store plain-text passwords**. If your database is compromised -- and breaches happen to companies of every size -- every user's password is exposed. Since people reuse passwords, a breach on your site can compromise their banking, email, and everything else.

Instead, you store a **hash** -- a one-way transformation. You can turn a password into a hash, but you cannot reverse a hash back into a password.

```
Password: "mysecretpassword"
Hash:     "$argon2id$v=19$m=65536,t=3,p=4$..."
```

### Not All Hash Functions Are Equal

General-purpose hash functions like MD5 and SHA-256 are _too fast_ -- an attacker with a GPU can try billions of guesses per second. Password hashing algorithms are intentionally slow, making brute-force attacks impractical:

```
Algorithm       Speed (per GPU)        Security
──────────      ─────────────────      ────────
MD5             ~50 billion/sec        BROKEN -- never use
SHA-256         ~5 billion/sec         Too fast for passwords
bcrypt          ~100,000/sec           Good, widely used
argon2id        ~10,000/sec            Best -- memory-hard, GPU-resistant
```

**Argon2** is the current recommendation. It is resistant to GPU-based attacks because it requires significant memory in addition to CPU time. A GPU has many cores but limited memory per core, which makes argon2 hashing inherently parallel-resistant.

### Salting

A **salt** is random data mixed into the password before hashing. Without salting, two users with the password "password123" would produce identical hashes -- an attacker could use precomputed "rainbow tables" to crack them instantly. Salting ensures every hash is unique even for identical passwords.

Both bcrypt and argon2 handle salting automatically -- the salt is embedded in the output hash:

```typescript
import { hash, verify } from '@node-rs/argon2';

// During registration: hash the password
const password = 'mysecretpassword';
const passwordHash = await hash(password, {
  memoryCost: 65536,   // 64MB of memory
  timeCost: 3,         // 3 iterations
  parallelism: 4,      // 4 parallel threads
});
// hash: "$argon2id$v=19$m=65536,t=3,p=4$..." (salt embedded)

// During login: verify the submitted password against the stored hash
const isValid = await verify(passwordHash, 'mysecretpassword');
// isValid === true
```

```
# WRONG: Using bcrypt with low cost factor
const hash = await bcrypt.hash(password, 4);
# Cost factor 4 is nearly instant -- barely better than no hashing.

# CORRECT: Using argon2 with appropriate parameters
const hash = await hash(password, {
  memoryCost: 65536,  // 64MB -- forces memory allocation per attempt
  timeCost: 3,        // 3 iterations -- slows down each attempt
  parallelism: 4,     // 4 threads -- uses CPU effectively
});
# Each hash takes ~300ms. Brute force becomes impractical.
```

### Password Strength: What Actually Works

```
# WRONG: Complex character requirements
"Must contain uppercase, lowercase, number, and special character"
# Result: Users create "Password1!" and write it on a sticky note.
# These rules do not significantly improve security.

# CORRECT: Minimum length and breach checking
"Must be at least 12 characters"
# Check against known breached passwords (Have I Been Pwned API)
# Encourage passphrases: "correct horse battery staple"
# Length is the single biggest factor in password strength.
```

## Cookie Security

Cookies are the transport mechanism for sessions. Setting them correctly is non-negotiable:

```typescript
cookies.set('session', sessionId, {
  path: '/',         // Available on all routes
  httpOnly: true,    // JavaScript cannot read this cookie
  secure: true,      // Only sent over HTTPS
  sameSite: 'lax',   // Protects against CSRF attacks
  maxAge: 60 * 60 * 24 * 7  // Expires in 7 days (seconds)
});
```

Why each flag matters:

- **httpOnly** prevents JavaScript from accessing the cookie via `document.cookie`. This stops XSS (cross-site scripting) attacks from stealing session IDs. If an attacker injects a script into your page, they still cannot read httpOnly cookies.
- **secure** ensures the cookie is only sent over HTTPS. Without this, an attacker on the same network (public WiFi) could intercept the cookie over plain HTTP.
- **sameSite: 'lax'** prevents the cookie from being sent on cross-origin POST requests, which is the primary CSRF vector. The `'strict'` setting is more aggressive but can break legitimate flows (like clicking a link from an email).
- **maxAge** sets when the cookie expires. Balance security (shorter = safer) against user convenience (longer = fewer re-logins).

```
# WRONG: Missing security flags
cookies.set('session', sessionId, { path: '/' });
# httpOnly defaults to false -- JavaScript can steal the cookie via XSS
# secure defaults to false -- cookie sent over plain HTTP
# sameSite varies by browser -- CSRF may not be prevented

# CORRECT: All security flags explicitly set
cookies.set('session', sessionId, {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7
});
```

### Session Expiry and Rotation

Sessions should not last forever. Even with all the security flags, a stolen cookie grants access until the session expires:

```typescript
// Session rotation: extend the session on each request if past half-life
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = await validateSession(sessionId);

    if (session) {
      event.locals.user = session.user;

      // If session is more than halfway through its lifetime, rotate it
      const halfLife = 3.5 * 24 * 60 * 60 * 1000; // 3.5 days
      const sessionAge = Date.now() - new Date(session.createdAt).getTime();

      if (sessionAge > halfLife) {
        const newSessionId = randomBytes(32).toString('hex');
        await createSession(newSessionId, session.userId);
        await deleteSession(sessionId);

        event.cookies.set('session', newSessionId, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7
        });
      }
    }
  }

  return resolve(event);
};
```

Session rotation limits the window of opportunity for a stolen session. Even if an attacker captures a session cookie, it becomes invalid within a few days and is replaced with a new one that only the legitimate user possesses.

## CSRF Protection

**Cross-Site Request Forgery (CSRF)** is an attack where a malicious site tricks the user's browser into making a request to your app. Since cookies are sent automatically, the request appears authenticated.

```html
<!-- Attacker's site -->
<form action="https://yourbank.com/transfer" method="POST">
  <input name="amount" value="10000" />
  <input name="to" value="attacker" />
  <button>Click for free prize!</button>
</form>
```

If the user is logged into the bank, their session cookie is sent with this form submission. The bank's server sees a valid session and processes the transfer.

SvelteKit protects against CSRF automatically: it checks the `Origin` header on form submissions and rejects requests that do not originate from your domain. Combined with `sameSite: 'lax'` cookies, this provides robust CSRF protection out of the box. You do not need to implement CSRF tokens manually in SvelteKit.

```
# SvelteKit's CSRF protection works by:
1. Checking the Origin header on every non-GET request
2. Comparing it to the expected origin (your domain)
3. Rejecting requests from different origins with a 403

# This means:
- Form submissions from attacker.com → rejected (wrong Origin)
- Form submissions from your app → accepted (matching Origin)
- GET requests → allowed (GET should never mutate state anyway)
```

## Rate Limiting: Preventing Brute-Force Attacks

Without rate limiting, an attacker can try thousands of password combinations per second:

```typescript
// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }

  if (record.count >= 5) {
    return false; // Blocked
  }

  record.count++;
  return true;
}

// In your login action:
export const actions: Actions = {
  login: async ({ request, cookies, getClientAddress }) => {
    const ip = getClientAddress();

    if (!checkRateLimit(ip)) {
      return fail(429, {
        error: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    // ... normal login logic
  }
};
```

```
# WRONG: No rate limiting on login endpoint
# An attacker can try thousands of passwords per minute.
# Even with argon2, weak passwords will be found quickly.

# CORRECT: Rate limit to 5 attempts per 15 minutes per IP
# After 5 failures, the attacker must wait.
# Combined with argon2, brute force is practically impossible.
```

For production, use a proper rate limiting solution (Redis-based, Cloudflare rate limiting, etc.) rather than in-memory storage, which resets on server restart and does not work with multiple server instances.

## Why Use an Auth Library

Authentication has an enormous surface area for security mistakes. You need to handle password hashing, session management, cookie security, CSRF protection, rate limiting, account lockout, password reset flows, email verification, OAuth integration, and more. Missing any one of these creates a vulnerability.

Libraries like **Lucia** (designed for SvelteKit) and **Auth.js** (framework-agnostic) handle these concerns for you. They are maintained by security-conscious teams and have been audited by the community.

```typescript
// With Lucia, session validation is concise and correct
import { lucia } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);
  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    if (session && session.fresh) {
      const sessionCookie = lucia.createSessionCookie(session.id);
      event.cookies.set(sessionCookie.name, sessionCookie.value, {
        path: '.',
        ...sessionCookie.attributes
      });
    }
    if (!session) {
      const sessionCookie = lucia.createBlankSessionCookie();
      event.cookies.set(sessionCookie.name, sessionCookie.value, {
        path: '.',
        ...sessionCookie.attributes
      });
    }
    event.locals.user = user;
    event.locals.session = session;
  }
  return resolve(event);
};
```

```
# WRONG mental model: "I will roll my own auth to learn"
# You will learn, but your users will suffer from your education.
# Auth libraries exist because even experienced developers make
# mistakes when implementing auth from scratch.

# CORRECT mental model: "Use a library, study how it works"
# Use Lucia or Auth.js for your production code.
# Read their source code to understand the patterns.
# The learning happens through reading, not through reinventing.
```

## The Mental Model: Auth as a Cross-Cutting Concern

Authentication is not a feature you bolt onto one page. It is a **cross-cutting concern** that touches every layer of your application:

```
  Request → hooks.server.ts (validate session, attach user to locals)
              → +layout.server.ts (pass user to all child pages)
                → +page.server.ts (check authorization, load data)
                  → +page.svelte (render based on user state)
```

- **Hooks** (`hooks.server.ts`): Validate the session on every request, attach the user to `event.locals`
- **Load functions**: Read `event.locals.user` to decide what data to fetch
- **Actions**: Check authorization before performing mutations
- **Layouts**: Show different navigation for logged-in vs anonymous users
- **Components**: Conditionally render UI based on auth state
- **API routes**: Protect endpoints from unauthorized access

Think of `hooks.server.ts` as your security checkpoint. Every request passes through it. If you validate the session there and attach the user to `event.locals`, every downstream handler can simply check `event.locals.user` without duplicating auth logic.

### The Auth Guard Pattern

A common pattern is to protect an entire section of your app with an auth guard in the layout:

```typescript
// src/routes/(app)/+layout.server.ts
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

Every page under the `(app)` route group now requires authentication. If the user is not logged in, they are redirected to `/login`. The user data is available in every child page:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<nav>
  <span>Welcome, {data.user.email}</span>
  <form method="POST" action="/logout">
    <button type="submit">Log out</button>
  </form>
</nav>

{@render children()}
```

### Protecting API Routes

API endpoints (`+server.ts`) need the same protection:

```typescript
// src/routes/api/posts/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
  // Authentication check
  if (!locals.user) {
    throw error(401, 'Not authenticated');
  }

  // Authorization check
  if (locals.user.role !== 'editor' && locals.user.role !== 'admin') {
    throw error(403, 'Not authorized to create posts');
  }

  const body = await request.json();
  // ... create post
  return json({ success: true });
};
```

## Logout: Destroying Sessions Properly

Logout is not just "delete the cookie." You must also destroy the server-side session:

```typescript
// src/routes/logout/+page.server.ts
import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const actions: Actions = {
  default: async ({ cookies }) => {
    const sessionId = cookies.get('session');

    if (sessionId) {
      // Delete the session from the database FIRST
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    }

    // Then delete the cookie
    cookies.delete('session', { path: '/' });

    throw redirect(303, '/login');
  }
};
```

```
# WRONG: Only deleting the cookie
cookies.delete('session', { path: '/' });
# The session record still exists in the database.
# If an attacker captured the session ID, they can still use it.

# CORRECT: Delete the session record AND the cookie
db.delete(sessions).where(eq(sessions.id, sessionId)).run();
cookies.delete('session', { path: '/' });
# The session is destroyed server-side. The ID is now useless.
```

### "Log Out Everywhere" -- Invalidating All Sessions

Sometimes users need to log out from all devices (e.g., after a password change or suspected compromise):

```typescript
// Delete ALL sessions for this user
export const actions: Actions = {
  logoutAll: async ({ locals, cookies }) => {
    if (locals.user) {
      db.delete(sessions)
        .where(eq(sessions.userId, locals.user.id))
        .run();
    }
    cookies.delete('session', { path: '/' });
    throw redirect(303, '/login');
  }
};
```

This is only possible with server-side sessions. With JWTs, there is no server-side record to delete -- you would have to maintain a blocklist, which is effectively a session store by another name.

## What NOT to Do

These are common mistakes that create real security vulnerabilities:

```
MISTAKE                              WHY IT IS DANGEROUS
──────────────────────────────────   ──────────────────────────────────────
Storing passwords in plain text      One breach exposes every password
Using MD5/SHA-256 for passwords      Too fast -- attackers try billions/sec
Storing sessions in localStorage     Any XSS script can steal them
Not setting httpOnly on cookies      JavaScript can steal the session
Not using HTTPS in production        Cookies transmitted in plain text
"Remember me" by storing password    Stolen cookie = stolen password
Using sequential session IDs         Attacker can guess valid IDs
Never expiring sessions              Stolen session lasts forever
No rate limiting on login            Enables brute-force attacks
Different errors for wrong email     Allows user enumeration
  vs wrong password
Trusting client-side auth checks     Client-side code is user-controlled
Not validating sessions per request  Deleted users retain access
Skipping the OAuth state parameter   Enables account linking attacks
Hardcoding secrets in source code    Anyone with repo access has the keys
```

## Registration: The Complete Flow

Registration has its own security concerns beyond just hashing the password:

```typescript
export const actions: Actions = {
  register: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = (formData.get('email') as string).toLowerCase().trim();
    const password = formData.get('password') as string;

    // Validate email format
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return fail(400, { error: 'Invalid email address', email });
    }

    // Validate password strength
    if (password.length < 12) {
      return fail(400, { error: 'Password must be at least 12 characters', email });
    }

    // Check if email is already registered
    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      // Do NOT reveal that the email exists
      // Instead, behave identically to a successful registration
      // and send a "you already have an account" email
      return { success: true };
    }

    // Hash password
    const passwordHash = await hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = db.insert(users).values({
      email,
      passwordHash,
      role: 'viewer',
    }).returning().get();

    // Create session
    const sessionId = randomBytes(32).toString('hex');
    db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).run();

    cookies.set('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    throw redirect(303, '/dashboard');
  }
};
```

Notice: when the email already exists, we do not return an error saying "email taken." That would be user enumeration. Instead, we return the same success response and (in a real app) send an email to the existing user saying "someone tried to register with your email."

## Try It

1. **Write pseudocode** for a complete authentication flow: registration (validate input, hash password with argon2, store user, create session, set cookie), login (find user, compare password, same error message for both failures, create session, set cookie), and a hook that validates the session on every request and attaches the user to `event.locals`.

2. **Draw the OAuth flow** for "Sign in with GitHub" -- list each HTTP redirect and what data moves between your app, the user's browser, and GitHub's servers. Identify which steps happen in the browser and which happen server-to-server. Include the state parameter and explain why it matters.

3. **Explain to a teammate** why storing a JWT in `localStorage` is less secure than an `httpOnly` cookie. What attack does each approach protect against or expose? When are JWTs appropriate despite this limitation?

4. **Design a sessions table** in Drizzle with columns for `id` (text, primary key), `userId` (integer, foreign key), `expiresAt` (text), and `createdAt` (text). Write the hook code that validates the session, checks expiry, and rotates sessions past half-life. Add a cascade delete so logging out a user removes their sessions.

5. **Implement rate limiting** pseudocode for the login endpoint. Track attempts by IP address. Block after 5 failures within 15 minutes. Then consider: what happens if an attacker uses many different IP addresses? What additional measures would you add?

## Key Takeaways

- **Authentication** verifies identity ("who are you"); **authorization** controls access ("what can you do") -- keep them as separate steps with different error handling
- **Session-based auth** stores state on the server and is the secure default for SvelteKit apps -- the server can revoke sessions instantly
- Session IDs must be **cryptographically random** (32+ bytes) -- never use sequential or predictable IDs
- **JWTs** are stateless but cannot be revoked -- use them for APIs and microservices, not for browser sessions in SvelteKit
- **OAuth** replaces password verification with a third-party provider but still needs local sessions -- always validate the `state` parameter to prevent CSRF
- Never store plain-text passwords -- use **argon2id** (preferred, memory-hard, GPU-resistant) with appropriate cost parameters
- Return the **same error message** for "user not found" and "wrong password" to prevent user enumeration
- Set cookies with **`httpOnly`**, **`secure`**, and **`sameSite: 'lax'`** -- each flag prevents a specific attack vector
- **SvelteKit handles CSRF protection** automatically via Origin header checking -- you do not need manual CSRF tokens
- **Rate limit** login endpoints to prevent brute-force attacks -- use production-grade solutions (Redis, Cloudflare) for multi-instance deployments
- **Session rotation** replaces session IDs at their half-life, limiting the window for stolen cookies
- Use an auth library (**Lucia**, **Auth.js**) instead of rolling your own -- study their source code to learn, but use their implementations for your product
- Auth is a **cross-cutting concern**: validate sessions in hooks, pass user data via `event.locals`, check authorization in every handler, use layout auth guards for route groups
- **Logout** must destroy both the server-side session record and the client cookie
- **Registration** should not reveal whether an email is already registered -- this is user enumeration
