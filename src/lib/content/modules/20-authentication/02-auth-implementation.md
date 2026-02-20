# Implementing Authentication

Now you will build a complete authentication system in SvelteKit. This covers user registration, password hashing, session creation, login, and using hooks to make the current user available across the entire app.

## Database Schema

Start with tables for users and sessions:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  expiresAt: text('expires_at').notNull()
});
```

Run `npx drizzle-kit push` to create these tables.

## Registration Flow

Create the registration page with a form action:

```typescript
// src/routes/register/+page.server.ts
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/db/schema';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = (formData.get('email') as string).toLowerCase().trim();
    const password = formData.get('password') as string;
    const name = formData.get('name') as string;

    // Validate
    if (!email || !password || !name) {
      return fail(400, { error: 'All fields are required', email, name });
    }

    if (password.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters', email, name });
    }

    // Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return fail(400, { error: 'Email already registered', email, name });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({ email, passwordHash, name }).returning();

    // Create session
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

    // Set cookie
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

After registration, the user is immediately logged in and redirected.

## Login Flow

Login finds the user, verifies the password, and creates a session:

```typescript
// src/routes/login/+page.server.ts
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { users, sessions } from '$lib/server/db/schema';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = (formData.get('email') as string).toLowerCase().trim();
    const password = formData.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail(400, { error: 'Invalid email or password', email });
    }

    // Create session
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

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

Notice the error message says "Invalid email or password" for both wrong email and wrong password. This prevents attackers from discovering which emails are registered.

## The Auth Hook

Use `hooks.server.ts` to look up the current user on every request:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (session && new Date(session.expiresAt) > new Date()) {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (user) {
        event.locals.user = user;
      }
    }
  }

  return resolve(event);
};
```

Now `event.locals.user` is available in every load function and form action. Add the type declaration so TypeScript knows about it:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user?: { id: number; email: string; name: string };
    }
  }
}

export {};
```

## Try It

Build the registration and login pages with forms that submit to the actions above. Add proper validation, error display, and use `use:enhance` for smooth submissions. Test the flow: register, get redirected, check that the session cookie exists.

## Key Takeaways

- Hash passwords with `bcrypt.hash()` during registration and verify with `bcrypt.compare()` during login
- Create sessions with unique IDs using `randomUUID()` and store them in the database
- Set session cookies with `httpOnly`, `secure`, and `sameSite` flags
- Use `hooks.server.ts` to look up the current user on every request via `event.locals`
- Always return generic error messages for login failures to avoid leaking information
- Use `throw redirect(303, '/path')` after successful login or registration
