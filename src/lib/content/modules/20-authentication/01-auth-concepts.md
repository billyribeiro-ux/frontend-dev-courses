# Authentication Concepts

Before you write a single line of auth code, you need a mental model for what authentication actually is and how it fits into a web application. Getting this wrong has real consequences — leaked passwords, session hijacking, unauthorized access to user data. This module gives you the foundational concepts so that when you implement auth in SvelteKit, you understand *why* each piece exists.

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

## Session-Based Authentication

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

```typescript
// Simplified session creation in a SvelteKit action
import { randomBytes } from 'crypto';

const sessionId = randomBytes(32).toString('hex');

// Store the session server-side (database, Redis, etc.)
await db.session.create({
  id: sessionId,
  userId: user.id,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
});

// Send the session ID to the browser as a cookie
cookies.set('session', sessionId, {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7
});
```

## Token-Based Authentication (JWT)

JSON Web Tokens (JWTs) take a different approach: instead of storing session data on the server, the token *itself* contains the user's identity and claims, signed with a secret key.

```
Header:    { "alg": "HS256", "typ": "JWT" }
Payload:   { "sub": "user_123", "role": "admin", "exp": 1700000000 }
Signature: HMAC-SHA256(header + payload, secret)
```

The server creates and signs the token at login. On subsequent requests, the client sends the token (usually in an `Authorization` header), and the server verifies the signature without needing to look anything up in a database.

**Tradeoffs vs sessions:**

| Aspect | Sessions | JWTs |
|--------|----------|------|
| Storage | Server-side (DB/Redis) | Client-side (cookie/localStorage) |
| Revocation | Delete the session record — instant | Cannot revoke until expiry (without a blocklist) |
| Scalability | Requires shared session store across servers | Stateless — any server can verify |
| Size | Cookie is tiny (just an ID) | Token can be large (contains claims) |
| Security | Harder to misuse | Easy to store insecurely (localStorage = XSS risk) |

The inability to revoke JWTs is their fundamental weakness. If a user's account is compromised, you cannot invalidate their token — you have to wait for it to expire or maintain a server-side blocklist, which defeats the "stateless" benefit. For most SvelteKit apps, session-based auth is the better default.

## OAuth: "Sign in with Google" Demystified

OAuth lets users authenticate with a third-party provider (Google, GitHub, etc.) instead of creating a password on your site. The redirect flow works like this:

```
1. User clicks "Sign in with Google" on your app
2. Your app redirects the user to Google's authorization page
3. User logs in to Google (if not already) and approves your app
4. Google redirects back to your app with an authorization code
5. Your server exchanges that code for an access token (server-to-server)
6. Your server uses the access token to fetch the user's profile from Google
7. Your server creates or finds a local user record and starts a session
```

The critical security detail: the authorization code exchange (step 5) happens server-to-server. Your client secret never touches the browser. This is why OAuth callbacks must hit a server endpoint, not a client-side route.

After the OAuth flow completes, you typically create a normal session for the user. OAuth replaces the "verify password" step — the rest of your auth system (sessions, cookies, authorization) works the same way.

## Password Hashing: Why and How

The most important rule: **never store plain-text passwords**. If your database is compromised — and breaches happen to companies of every size — every user's password is exposed. Since people reuse passwords, a breach on your site can compromise their banking, email, and everything else.

Instead, you store a **hash** — a one-way transformation. You can turn a password into a hash, but you cannot reverse a hash back into a password.

```
Password: "mysecretpassword"
Hash:     "$2b$10$N9qo8uLOickgx2ZMRZoMye..."
```

Not all hash functions are equal. General-purpose hash functions like MD5 and SHA-256 are *too fast* — an attacker can try billions of guesses per second. Password hashing algorithms like **bcrypt** and **argon2** are intentionally slow, making brute-force attacks impractical.

### Salting

A **salt** is random data mixed into the password before hashing. Without salting, two users with the password "password123" would produce identical hashes — an attacker could use precomputed "rainbow tables" to crack them instantly. Salting ensures every hash is unique even for identical passwords.

Bcrypt handles salting automatically — the salt is embedded in the output hash:

```typescript
import bcrypt from 'bcrypt';

// During registration: hash the password
const password = 'mysecretpassword';
const saltRounds = 10; // Cost factor — higher = slower = more secure
const hash = await bcrypt.hash(password, saltRounds);
// hash: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIj..." (salt is embedded)

// During login: verify the submitted password against the stored hash
const isValid = await bcrypt.compare('mysecretpassword', hash);
// isValid === true
```

The `saltRounds` parameter (also called the cost factor) controls how computationally expensive the hashing is. Each increment roughly doubles the time. A value of 10 takes about 100ms; a value of 12 takes about 300ms. Choose a value that is tolerable for your login flow but punishing for an attacker trying millions of guesses. 10-12 is standard for production as of 2025.

**Argon2** is the newer, recommended alternative — it is resistant to GPU-based attacks because it requires significant memory in addition to CPU time. Use it if your platform supports it.

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
- **secure** ensures the cookie is only sent over HTTPS. Without this, an attacker on the same network could intercept the cookie over plain HTTP.
- **sameSite: 'lax'** prevents the cookie from being sent on cross-origin POST requests, which is the primary CSRF vector. The `'strict'` setting is more aggressive but can break legitimate flows (like clicking a link from an email).

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

## Why Use an Auth Library

Authentication has an enormous surface area for security mistakes. You need to handle password hashing, session management, cookie security, CSRF protection, rate limiting, account lockout, password reset flows, email verification, OAuth integration, and more. Missing any one of these creates a vulnerability.

Libraries like **Lucia** (designed for SvelteKit) and **Auth.js** (framework-agnostic) handle these concerns for you. They are maintained by security-conscious teams and have been audited by the community.

```typescript
// With Lucia, session validation is a one-liner in your hooks
import { lucia } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);
  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    event.locals.user = user;
    event.locals.session = session;
  }
  return resolve(event);
};
```

Roll your own auth only if you are building an auth library. For application development, use a proven library and focus your engineering effort on your product.

## The Mental Model: Auth as a Cross-Cutting Concern

Authentication is not a feature you bolt onto one page. It is a **cross-cutting concern** that touches every layer of your application:

- **Hooks** (`hooks.server.ts`): Validate the session on every request, attach the user to `event.locals`
- **Load functions**: Read `event.locals.user` to decide what data to fetch
- **Actions**: Check authorization before performing mutations
- **Layouts**: Show different navigation for logged-in vs anonymous users
- **Components**: Conditionally render UI based on auth state
- **API routes**: Protect endpoints from unauthorized access

```
Request → hooks.server.ts (validate session, attach user to locals)
            → +layout.server.ts (pass user to all child pages)
              → +page.server.ts (check authorization, load data)
                → +page.svelte (render based on user state)
```

Think of `hooks.server.ts` as your security checkpoint. Every request passes through it. If you validate the session there and attach the user to `event.locals`, every downstream handler can simply check `event.locals.user` without duplicating auth logic.

## What NOT to Do

These are common mistakes that create real security vulnerabilities:

- Storing passwords in plain text or using MD5/SHA-256 (too fast, easily cracked)
- Storing session tokens in `localStorage` (vulnerable to XSS — any script on the page can read it)
- Not setting `httpOnly` on session cookies
- Not using HTTPS in production
- Implementing "remember me" by storing the password in a cookie
- Using predictable session IDs (sequential numbers, timestamps)
- Not expiring sessions — a stolen session should not last forever
- Skipping rate limiting on login endpoints (enables brute-force attacks)

## Try It

1. Write pseudocode for a complete authentication flow: registration (hash password, store user), login (find user, compare password, create session, set cookie), and a hook that validates the session on every request.

2. Draw the OAuth flow for "Sign in with GitHub" — list each HTTP redirect and what data moves between your app, the user's browser, and GitHub's servers. Identify which steps happen in the browser and which happen server-to-server.

3. Explain to a teammate why storing a JWT in `localStorage` is less secure than an `httpOnly` cookie. What attack does each approach protect against or expose?

## Key Takeaways

- Authentication verifies identity ("who are you"); authorization controls access ("what can you do") — keep them separate
- Session-based auth stores state on the server and is the secure default for SvelteKit apps
- JWTs are stateless but cannot be revoked — use them for APIs and microservices, not for browser sessions
- OAuth replaces password verification with a third-party provider but still needs local sessions
- Never store plain-text passwords — use bcrypt or argon2 with automatic salting
- Set cookies with `httpOnly`, `secure`, and `sameSite` — each flag prevents a specific attack vector
- SvelteKit handles CSRF protection automatically via Origin header checking
- Use an auth library (Lucia, Auth.js) instead of rolling your own — the security surface area is vast
- Auth is a cross-cutting concern: validate sessions in hooks, pass user data via locals, check authorization in every handler
