# Authentication Concepts

**Authentication** answers the question "Who are you?" It is the process of verifying a user's identity, typically through a username/email and password. **Authorization** is a separate concept — it answers "What are you allowed to do?" You must authenticate first, then authorize.

Understanding these concepts before writing code prevents critical security mistakes that expose user data.

## How Sessions Work

When a user logs in, the server creates a **session** — a record that says "this person has been verified." The server stores a session identifier and sends it to the browser as a **cookie**. On every subsequent request, the browser automatically includes the cookie, and the server looks up the session to identify the user.

```
1. User submits email + password
2. Server verifies credentials
3. Server creates a session record (in the database)
4. Server sends a Set-Cookie header with the session ID
5. Browser stores the cookie
6. Browser sends the cookie with every future request
7. Server reads the cookie and looks up the session
```

Cookies are the standard mechanism because they are sent automatically with every request and can be configured for security.

## Password Hashing

The most important rule of authentication: **never store plain-text passwords**. If your database is compromised, every user's password would be exposed.

Instead, you store a **hash** — a one-way transformation of the password. Hashing is irreversible: you can turn a password into a hash, but you cannot turn a hash back into a password.

```
Password: "mysecretpassword"
Hash:     "$2b$10$N9qo8uLOickgx2ZMRZoMye..."
```

When a user logs in, you hash the submitted password and compare it to the stored hash. If they match, the password is correct.

## Bcrypt and Salt

The `bcrypt` library is the standard for password hashing. It automatically adds a **salt** — random data mixed into the hash — so that two users with the same password get different hashes.

```typescript
import bcrypt from 'bcrypt';

// Hashing a password (during registration)
const password = 'mysecretpassword';
const saltRounds = 10;
const hash = await bcrypt.hash(password, saltRounds);

// Verifying a password (during login)
const isValid = await bcrypt.compare('mysecretpassword', hash);
// isValid === true
```

The `saltRounds` parameter controls how computationally expensive the hash is. Higher values are more secure but slower. 10 is the standard default.

## Cookie Security

When setting session cookies, use these security options:

```typescript
cookies.set('session', sessionId, {
  path: '/',         // Available on all pages
  httpOnly: true,    // JavaScript cannot read this cookie
  secure: true,      // Only sent over HTTPS
  sameSite: 'lax',   // Protects against CSRF attacks
  maxAge: 60 * 60 * 24 * 7  // Expires in 7 days (seconds)
});
```

- **httpOnly** prevents JavaScript from accessing the cookie, stopping XSS attacks from stealing sessions
- **secure** ensures the cookie is never sent over unencrypted HTTP
- **sameSite** prevents the cookie from being sent with cross-site requests

## What NOT to Do

These are common mistakes beginners make with authentication:

- Storing passwords in plain text
- Using MD5 or SHA-256 for passwords (too fast, easily cracked)
- Storing session data in localStorage (vulnerable to XSS)
- Not setting httpOnly on session cookies
- Not using HTTPS in production

## Try It

Write pseudocode for a complete authentication flow: registration (hash password, store user), login (find user, compare password, create session, set cookie), and a request handler that reads the cookie and looks up the session to identify the current user.

## Key Takeaways

- Authentication verifies identity ("who are you"), authorization controls access ("what can you do")
- Sessions are server-side records that track logged-in users, identified by a cookie
- Never store plain-text passwords — always use bcrypt to hash them
- Bcrypt adds a salt automatically so identical passwords produce different hashes
- Set cookies with `httpOnly`, `secure`, and `sameSite` for security
- Cookies are sent automatically with every request, making them ideal for sessions
