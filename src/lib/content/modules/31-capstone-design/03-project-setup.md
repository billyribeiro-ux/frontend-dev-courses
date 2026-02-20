# Project Setup

With requirements defined and the database designed, it is time to scaffold the capstone project. In this lesson you will set up a production-ready SvelteKit project with Tailwind CSS for styling, Drizzle ORM for the database, authentication, and a clean folder structure that scales.

Getting the foundation right now saves hours of refactoring later. Take your time with this setup — every decision here affects the rest of the build.

## Scaffolding the SvelteKit Project

Create a new SvelteKit project with TypeScript:

```bash
npx sv create ecommerce-store
cd ecommerce-store
npm install
```

During setup, select:
- TypeScript
- Prettier + ESLint
- Playwright for E2E testing
- Vitest for unit testing

## Installing Dependencies

Install everything you need in one go:

```bash
# Styling
npm install -D tailwindcss @tailwindcss/vite

# Database
npm install drizzle-orm postgres
npm install -D drizzle-kit

# Authentication
npm install lucia @lucia-auth/adapter-drizzle

# Payments
npm install stripe

# Utilities
npm install zod
```

## Setting Up Tailwind CSS

Configure Tailwind with the Vite plugin:

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
});
```

```css
/* src/app.css */
@import 'tailwindcss';
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

## Setting Up Drizzle

Configure the database connection and Drizzle:

```typescript
// src/lib/server/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

Copy the schema file from the previous lesson into `src/lib/server/schema.ts`, then configure Drizzle Kit:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

Generate and run your first migration:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Setting Up Authentication

Configure Lucia for session-based authentication:

```typescript
// src/lib/server/auth.ts
import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from './db';
import { users, sessions } from './schema';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === 'production'
    }
  },
  getUserAttributes: (attributes) => ({
    email: attributes.email,
    name: attributes.name,
    role: attributes.role
  })
});
```

Add session validation in hooks:

```typescript
// src/hooks.server.ts
import { lucia } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);

  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session?.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    event.cookies.set(cookie.name, cookie.value, {
      path: '.',
      ...cookie.attributes
    });
  }

  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    event.cookies.set(cookie.name, cookie.value, {
      path: '.',
      ...cookie.attributes
    });
  }

  event.locals.user = user;
  event.locals.session = session;
  return resolve(event);
};
```

## Environment Variables

Create a `.env` file for local development:

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/ecommerce
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_STRIPE_KEY=pk_test_...
```

Add type definitions for environment variables:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: import('lucia').User | null;
      session: import('lucia').Session | null;
    }
  }
}

export {};
```

## Folder Structure

Organize your project for scalability:

```
src/
  lib/
    components/        ← Reusable UI components
      ui/              ← Buttons, inputs, cards
      layout/          ← Header, footer, sidebar
      product/         ← Product-specific components
      cart/            ← Cart-specific components
    server/            ← Server-only code
      db.ts
      schema.ts
      auth.ts
      validators.ts
    state/             ← Global state (.svelte.ts files)
      cart.svelte.ts
    utils/             ← Shared utility functions
      format.ts
  routes/
    (store)/           ← Public store routes (grouped)
      +layout.svelte
      products/
      cart/
      checkout/
    (admin)/           ← Admin routes (grouped)
      admin/
        +layout.svelte
    api/               ← API routes
    auth/              ← Login, signup, logout
```

Using route groups `(store)` and `(admin)` lets you have different layouts without affecting the URL structure.

## Try It

Complete the project setup on your machine. Install all dependencies, configure Tailwind, Drizzle, and authentication. Run the first migration, seed the database with at least 3 categories and 10 products, and verify everything works by starting the dev server.

## Key Takeaways

- Set up all tooling (Tailwind, Drizzle, auth, Stripe) before writing feature code
- Use `.env` files for secrets and never commit them to git
- Organize routes with route groups to share layouts without affecting URLs
- Separate server-only code into `$lib/server` so it never leaks to the client
- A clean folder structure (components, state, utils, server) keeps the project navigable as it grows
- Run migrations early to verify your schema works before building on top of it
