# Environment & Config

Every application needs configuration: API keys, database URLs, feature flags, and deployment-specific settings. Getting these wrong is a security risk — leak a private API key to the client and it is compromised forever. SvelteKit provides four `$env` modules that make it impossible to accidentally expose secrets, plus a rich configuration system in `svelte.config.js` for controlling how your app builds and runs.

This lesson covers every `$env` module in depth, environment validation with Zod, secrets management strategies, feature flags, adapter-specific configuration, and the complete `svelte.config.js` surface area.

## The Four $env Modules

SvelteKit splits environment variables along two axes: **static vs dynamic** and **private vs public**. This creates four modules, each with different characteristics. Understanding when to use each is essential for building secure, deployable applications.

### $env/static/private

Build-time, server-only. These values are read from your `.env` file at build time and replaced inline in the code via Vite's `define` mechanism. They never appear in client bundles:

```typescript
// src/routes/api/data/+server.ts
import { DATABASE_URL, API_SECRET, SMTP_PASSWORD } from '$env/static/private';

export async function GET() {
  // At build time, DATABASE_URL is replaced with its literal value.
  // The string "DATABASE_URL" does not appear in the output.
  const db = connect(DATABASE_URL);
  const data = await fetchExternal(API_SECRET);
  return new Response(JSON.stringify(data));
}
```

If you try to import `$env/static/private` in a client-side file (a `.svelte` component or a `+page.ts` file), SvelteKit throws a build error. This is a guardrail, not a convention — it is physically impossible to leak these values to the browser.

**When to use it:** For any secret value known at build time — database connection strings, API keys for third-party services, SMTP credentials, encryption keys, webhook secrets.

**How it works internally:** Vite replaces every reference to the imported variable with the literal string value during the build. The output JavaScript contains the actual value embedded inline. This means the value cannot change without a rebuild, but it also means there is zero runtime overhead — no environment variable lookup on each request.

### $env/static/public

Build-time, available on the client. Variables must start with `PUBLIC_` (configurable via `svelte.config.js`). They are embedded in the client bundle:

```svelte
<script>
  import { PUBLIC_API_URL, PUBLIC_APP_NAME, PUBLIC_SENTRY_DSN } from '$env/static/public';
</script>

<h1>Welcome to {PUBLIC_APP_NAME}</h1>
```

**When to use it:** For values the client needs that are known at build time — public API endpoints, analytics IDs (Google Analytics, Sentry DSN), feature flags that do not change between deployments, the app's display name.

**Security model:** Never put secrets here. The `PUBLIC_` prefix is a deliberate, loud reminder that anyone who views the page source can see these values. If you accidentally put `PUBLIC_STRIPE_SECRET_KEY` in your `.env` file, the naming at least forces you to think about what you are doing.

### $env/dynamic/private

Runtime, server-only. These values are read from `process.env` (or the platform equivalent) at request time, not at build time. Use them when the value changes per deployment or environment without a rebuild:

```typescript
// src/routes/api/status/+server.ts
import { env } from '$env/dynamic/private';

export async function GET() {
  // Read at runtime — can change without rebuilding
  const region = env.DEPLOY_REGION;
  const version = env.APP_VERSION;
  const dbUrl = env.DATABASE_URL;

  return new Response(JSON.stringify({
    region,
    version,
    healthy: true,
    timestamp: Date.now()
  }));
}
```

**When to use it:** When the same build artifact deploys to multiple environments (staging, production, regional deployments) with different configuration. Container-based deployments commonly inject environment variables at runtime. Also useful for values that change frequently (feature flags toggled via environment variables) without requiring a full redeploy.

**Performance note:** Dynamic env vars have a small runtime cost — they perform a `process.env` lookup on each access. For values that never change, prefer `$env/static/private` for the build-time inlining optimization.

### $env/dynamic/public

Runtime, available on the client. Like dynamic/private but accessible in the browser. During SSR, it reads from `process.env`. On the client, SvelteKit serializes the public dynamic env vars and sends them as part of the page payload:

```svelte
<script>
  import { env } from '$env/dynamic/public';
</script>

<footer>
  Region: {env.PUBLIC_DEPLOY_REGION} |
  Build: {env.PUBLIC_BUILD_ID}
</footer>
```

**When to use it:** For runtime values the client needs — CDN URLs that differ by region, runtime feature flags controlled by environment variables, deployment identifiers for debugging.

**How client access works:** On the server, `env.PUBLIC_*` reads from `process.env`. SvelteKit collects all `PUBLIC_`-prefixed dynamic env vars and serializes them into the HTML response. The client reads them from that serialized payload, not from `process.env` (which does not exist in the browser).

## Decision Matrix: Which Module to Use

| Scenario | Module | Reasoning |
|----------|--------|-----------|
| Stripe secret key | `static/private` | Secret, known at build time |
| Database URL (single deployment) | `static/private` | Secret, does not change at runtime |
| Database URL (multi-env deploy) | `dynamic/private` | Secret, changes per environment |
| Public Stripe key | `static/public` | Client needs it, known at build time |
| Sentry DSN | `static/public` | Client needs it, not secret |
| Feature flag (server toggle) | `dynamic/private` | Can change without rebuild |
| Feature flag (client toggle) | `dynamic/public` | Client needs it, changes at runtime |
| App region for footer | `dynamic/public` | Client needs it, varies by deployment |
| S3 bucket name | `dynamic/private` | Server-only, varies by deployment |

**Rule of thumb:** Start with `static/private`. Move to `static/public` if the client needs it. Move to `dynamic/*` only if you need to change the value without rebuilding.

## .env File Configuration

SvelteKit uses Vite's `.env` file loading. The resolution order (later files override earlier ones):

```
.env                 ← always loaded
.env.local           ← always loaded, gitignored (local overrides)
.env.[mode]          ← loaded for specific mode (development, production)
.env.[mode].local    ← loaded for specific mode, gitignored
```

In development, `mode` is `development`. During `vite build`, `mode` is `production`.

```bash
# .env — shared defaults, committed to version control
PUBLIC_APP_NAME=MyStore
PUBLIC_API_URL=https://api.example.com

# .env.local — local overrides, gitignored
DATABASE_URL=postgres://localhost:5432/mystore_dev
API_SECRET=dev-secret-key-not-for-production

# .env.production — production defaults, committed
PUBLIC_API_URL=https://api.mystore.com

# .env.production.local — production secrets, gitignored
DATABASE_URL=postgres://prod-host:5432/mystore
API_SECRET=prod-secret-key
STRIPE_SECRET_KEY=sk_live_...
```

### .gitignore Setup

Always gitignore local files:

```gitignore
# .gitignore
.env.local
.env.*.local
```

Never commit files with actual secrets. The `.env` file can be committed if it only contains non-sensitive defaults and public values. The `.env.local` file overrides with actual credentials and is gitignored.

### Customizing the env Directory and Prefix

```javascript
// svelte.config.js
const config = {
  kit: {
    env: {
      dir: './',              // Where to look for .env files (default: project root)
      publicPrefix: 'PUBLIC_', // Prefix for public env vars (default: 'PUBLIC_')
      privatePrefix: ''        // Prefix for private env vars (default: '', meaning all non-public)
    }
  }
};
```

You can change the public prefix if your team prefers a different convention, but `PUBLIC_` is the community standard and you should keep it unless you have a strong reason to change.

## Environment Validation with Zod

Environment variables are strings. They can be missing, empty, or malformed. Validating them at application startup catches configuration errors before they cause runtime failures:

```typescript
// src/lib/server/env.ts
import { z } from 'zod';
import {
  DATABASE_URL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD
} from '$env/static/private';
import {
  PUBLIC_APP_NAME,
  PUBLIC_API_URL,
  PUBLIC_STRIPE_KEY
} from '$env/static/public';

const privateEnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', 'STRIPE_SECRET_KEY must start with sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_', 'Invalid webhook secret format'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().positive('SMTP_PORT must be a positive integer'),
  SMTP_USER: z.string().min(1, 'SMTP_USER is required'),
  SMTP_PASSWORD: z.string().min(1, 'SMTP_PASSWORD is required')
});

const publicEnvSchema = z.object({
  PUBLIC_APP_NAME: z.string().min(1, 'PUBLIC_APP_NAME is required'),
  PUBLIC_API_URL: z.string().url('PUBLIC_API_URL must be a valid URL'),
  PUBLIC_STRIPE_KEY: z.string().startsWith('pk_', 'PUBLIC_STRIPE_KEY must start with pk_')
});

// Validate at module load time — fails fast if anything is wrong
const privateResult = privateEnvSchema.safeParse({
  DATABASE_URL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD
});

if (!privateResult.success) {
  console.error('Invalid private environment variables:');
  for (const issue of privateResult.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Environment validation failed. Check your .env file.');
}

const publicResult = publicEnvSchema.safeParse({
  PUBLIC_APP_NAME,
  PUBLIC_API_URL,
  PUBLIC_STRIPE_KEY
});

if (!publicResult.success) {
  console.error('Invalid public environment variables:');
  for (const issue of publicResult.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Environment validation failed. Check your .env file.');
}

// Export typed, validated values
export const privateEnv = privateResult.data;
export const publicEnv = publicResult.data;
```

Now import from `$lib/server/env` instead of `$env/static/private` directly. You get validated, typed values with clear error messages when configuration is missing:

```typescript
// src/routes/api/checkout/+server.ts
import { privateEnv } from '$lib/server/env';
import Stripe from 'stripe';

// privateEnv.STRIPE_SECRET_KEY is guaranteed to be a string starting with 'sk_'
const stripe = new Stripe(privateEnv.STRIPE_SECRET_KEY);
```

### Validating Dynamic Env Vars

For dynamic environment variables, validate at request time or at server startup:

```typescript
// src/lib/server/env-dynamic.ts
import { z } from 'zod';
import { env } from '$env/dynamic/private';

const dynamicSchema = z.object({
  DEPLOY_REGION: z.enum(['us-east-1', 'us-west-2', 'eu-west-1']).default('us-east-1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(100),
  MAINTENANCE_MODE: z.coerce.boolean().default(false)
});

// Lazy validation — call this when you need the values
export function getDynamicEnv() {
  return dynamicSchema.parse(env);
}
```

## Feature Flags

Feature flags let you ship code to production but only activate it for certain users, environments, or conditions. Environment variables are the simplest implementation:

```bash
# .env
PUBLIC_FEATURE_NEW_CHECKOUT=false
PUBLIC_FEATURE_DARK_MODE=true
FEATURE_EXPERIMENTAL_SEARCH=false
```

### Server-Side Feature Flags

```typescript
// src/lib/server/features.ts
import { env } from '$env/dynamic/private';

export function isFeatureEnabled(flag: string): boolean {
  const value = env[`FEATURE_${flag.toUpperCase()}`];
  return value === 'true' || value === '1';
}
```

```typescript
// src/routes/search/+page.server.ts
import { isFeatureEnabled } from '$lib/server/features';

export async function load() {
  const useNewSearch = isFeatureEnabled('EXPERIMENTAL_SEARCH');

  const results = useNewSearch
    ? await experimentalSearch(query)
    : await legacySearch(query);

  return { results, useNewSearch };
}
```

### Client-Side Feature Flags

```svelte
<script>
  import { env } from '$env/dynamic/public';

  const darkModeEnabled = env.PUBLIC_FEATURE_DARK_MODE === 'true';
  const newCheckout = env.PUBLIC_FEATURE_NEW_CHECKOUT === 'true';
</script>

{#if newCheckout}
  <NewCheckoutFlow />
{:else}
  <ClassicCheckoutFlow />
{/if}
```

### Advanced: User-Level Feature Flags

For per-user flags (A/B testing, gradual rollouts), combine environment variables with user data:

```typescript
// src/lib/server/features.ts
type FeatureFlag = {
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  allowedRoles?: string[];
  allowedEmails?: string[];
};

const flags: Record<string, FeatureFlag> = {
  NEW_CHECKOUT: {
    enabled: true,
    rolloutPercentage: 25 // 25% of users
  },
  ADMIN_V2: {
    enabled: true,
    allowedRoles: ['super_admin']
  },
  BETA_FEATURES: {
    enabled: true,
    allowedEmails: ['beta@example.com', 'tester@example.com']
  }
};

export function isEnabledForUser(
  flag: string,
  user?: { id: number; email: string; role: string }
): boolean {
  const config = flags[flag];
  if (!config?.enabled) return false;

  if (config.allowedEmails?.length) {
    return user ? config.allowedEmails.includes(user.email) : false;
  }

  if (config.allowedRoles?.length) {
    return user ? config.allowedRoles.includes(user.role) : false;
  }

  if (config.rolloutPercentage !== undefined && user) {
    // Deterministic rollout based on user ID
    const hash = user.id % 100;
    return hash < config.rolloutPercentage;
  }

  return true;
}
```

## Secrets Management

### Development Secrets

During development, `.env.local` is sufficient. But follow these practices:

1. **Never commit secrets.** Add `.env.local` and `.env.*.local` to `.gitignore`.
2. **Document required variables.** Create a `.env.example` file with all required variables (without values) and commit it:

```bash
# .env.example — committed to version control
# Copy this to .env.local and fill in the values

# Database
DATABASE_URL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PUBLIC_STRIPE_KEY=

# SMTP
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=

# App
PUBLIC_APP_NAME=MyStore
PUBLIC_API_URL=http://localhost:5173
```

3. **Use test/sandbox credentials.** Stripe test keys, local database URLs, mock SMTP servers (like Mailpit or MailHog).

### Production Secrets

In production, environment variables should come from your deployment platform's secrets management, not from `.env` files on disk:

**Vercel:** Set environment variables in the Vercel dashboard or via `vercel env add`. They are encrypted at rest and injected at build time (for static) or runtime (for serverless functions).

**Docker / Node adapter:** Pass environment variables via `docker run -e` or Docker Compose `environment` sections. For Kubernetes, use Secrets objects mounted as environment variables.

```yaml
# docker-compose.yml
services:
  app:
    build: .
    environment:
      DATABASE_URL: postgres://db:5432/mystore
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}  # Read from host environment
    env_file:
      - .env.production.local  # Or use a file
```

**Cloudflare Workers:** Use `wrangler secret put` to add encrypted secrets.

### Adapter-Specific Env Access

Different adapters provide environment variables differently:

```typescript
// adapter-node: process.env works as expected
import { env } from '$env/dynamic/private';
// env.DATABASE_URL reads from process.env.DATABASE_URL

// adapter-cloudflare: env vars come from platform.env
// In hooks.server.ts:
export async function handle({ event, resolve }) {
  // Cloudflare Workers environment bindings
  const dbUrl = event.platform?.env?.DATABASE_URL;
  // ...
}

// adapter-vercel: process.env works for serverless functions
// Edge functions use a different mechanism
import { env } from '$env/dynamic/private';
```

## SvelteKit Config Deep Dive

The `svelte.config.js` file controls how SvelteKit builds and serves your app:

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      runtime: 'nodejs22.x'
    }),

    alias: {
      $components: 'src/lib/components',
      $server: 'src/lib/server',
      $utils: 'src/lib/utils'
    },

    csrf: {
      checkOrigin: true  // Enabled by default — protects form actions
    },

    env: {
      dir: './',
      publicPrefix: 'PUBLIC_'
    },

    prerender: {
      crawl: true,
      entries: ['*'],
      handleHttpError: 'warn'
    },

    version: {
      name: Date.now().toString()
    }
  }
};

export default config;
```

### Adapters

The adapter determines where and how your app runs:

- **`@sveltejs/adapter-vercel`** — Vercel serverless functions and edge. Zero-config for most projects. Supports ISR (Incremental Static Regeneration) and edge functions.
- **`@sveltejs/adapter-node`** — Any Node.js server. Outputs a standalone Node application you can run with `node build/index.js`. Use for Docker, VPS, Railway, Fly.io.
- **`@sveltejs/adapter-static`** — Static site generation with no server. Every page is prerendered to HTML files. Use for documentation sites, landing pages, blogs with no dynamic content.
- **`@sveltejs/adapter-cloudflare`** — Cloudflare Workers and Pages. Runs at the edge in Cloudflare's global network.

### Path Aliases

The `alias` option creates shortcuts beyond the built-in `$lib`. This keeps imports clean in large projects:

```typescript
// Instead of: import Button from '../../../lib/components/Button.svelte'
import Button from '$components/Button.svelte';

// Instead of: import { db } from '../../../lib/server/db'
import { db } from '$server/db';
```

### Version and the Updated Store

The `version.name` config powers SvelteKit's `updated` store from `$app/stores`. When you deploy a new version, SvelteKit can detect it and prompt the user to reload:

```svelte
<script>
  import { updated } from '$app/stores';
</script>

{#if $updated}
  <div class="update-banner" role="alert">
    A new version is available.
    <button onclick={() => location.reload()}>Reload</button>
  </div>
{/if}
```

SvelteKit periodically polls a version file on the server. When the version changes, `$updated` becomes `true`. This is useful for long-lived SPA sessions where the user might be on an old version for hours.

## Page Options Composition

Page options — `ssr`, `csr`, `prerender`, and `trailingSlash` — can be set in `+page.ts`, `+page.server.ts`, or `+layout.ts`. Layout-level options cascade down to all child pages:

```typescript
// src/routes/+layout.ts
export const ssr = true;
export const trailingSlash = 'never';

// src/routes/app/+layout.ts
export const ssr = true;
export const csr = true;

// src/routes/app/dashboard/+page.ts
export const prerender = false;
```

A child page can override options set by its parent layout. The most specific setting wins. This lets you set sensible defaults at the root and make exceptions where needed.

```typescript
// src/routes/marketing/+layout.ts
export const prerender = true;   // Prerender all marketing pages

// src/routes/marketing/pricing/+page.ts
export const prerender = false;  // Except pricing — it needs live data
```

## Custom Error Pages

SvelteKit renders `+error.svelte` when something goes wrong. You can place error pages at different levels of your route tree for different error experiences:

```svelte
<!-- src/routes/+error.svelte (root — catches everything) -->
<script>
  import { page } from '$app/state';
</script>

<h1>{page.status}: {page.error?.message}</h1>
<a href="/">Go home</a>
```

```svelte
<!-- src/routes/admin/+error.svelte (admin section) -->
<script>
  import { page } from '$app/state';
</script>

<div class="admin-error">
  <h1>Admin Error {page.status}</h1>
  <p>{page.error?.message}</p>
  <a href="/admin">Back to admin dashboard</a>
</div>
```

SvelteKit walks up the route tree to find the nearest `+error.svelte`. An error in `/admin/users/123` first looks for `/admin/users/+error.svelte`, then `/admin/+error.svelte`, then the root `/+error.svelte`. This lets you style error pages differently for different sections of your app.

Note that `+layout.svelte` errors are caught by the parent layout's error boundary, not the error page in the same directory. The root layout's errors are caught by the fallback error page at `src/error.html`.

## Complete Config Setup: Putting It All Together

Here is a complete, production-ready setup for a SvelteKit application:

```bash
# .env.example (committed)
# Copy to .env.local and fill in values

# Required — Server
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Required — Client
PUBLIC_APP_NAME=MyStore
PUBLIC_API_URL=http://localhost:5173
PUBLIC_STRIPE_KEY=

# Optional — Feature flags
PUBLIC_FEATURE_DARK_MODE=true
PUBLIC_FEATURE_NEW_CHECKOUT=false
FEATURE_EXPERIMENTAL_SEARCH=false

# Optional — Monitoring
PUBLIC_SENTRY_DSN=
```

```typescript
// src/lib/server/config.ts — single source of truth for all configuration
import { z } from 'zod';
import {
  DATABASE_URL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD
} from '$env/static/private';
import {
  PUBLIC_APP_NAME,
  PUBLIC_API_URL,
  PUBLIC_STRIPE_KEY
} from '$env/static/public';

const configSchema = z.object({
  database: z.object({
    url: z.string().url()
  }),
  stripe: z.object({
    secretKey: z.string().startsWith('sk_'),
    publicKey: z.string().startsWith('pk_'),
    webhookSecret: z.string().startsWith('whsec_')
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive(),
    user: z.string().min(1),
    password: z.string().min(1)
  }),
  app: z.object({
    name: z.string().min(1),
    apiUrl: z.string().url()
  })
});

export const config = configSchema.parse({
  database: { url: DATABASE_URL },
  stripe: {
    secretKey: STRIPE_SECRET_KEY,
    publicKey: PUBLIC_STRIPE_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET
  },
  smtp: {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    password: SMTP_PASSWORD
  },
  app: {
    name: PUBLIC_APP_NAME,
    apiUrl: PUBLIC_API_URL
  }
});

export type Config = z.infer<typeof configSchema>;
```

Usage throughout the application:

```typescript
// src/lib/server/db.ts
import { config } from '$lib/server/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(config.database.url);
export const db = drizzle(client);
```

```typescript
// src/lib/server/stripe.ts
import { config } from '$lib/server/config';
import Stripe from 'stripe';

export const stripe = new Stripe(config.stripe.secretKey);
```

```typescript
// src/lib/server/email.ts
import { config } from '$lib/server/config';
import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.password
  }
});
```

This pattern gives you a single file where all environment variables are validated, typed, and organized into logical groups. If any variable is missing or malformed, the application fails immediately at startup with a clear error message, rather than crashing later when the variable is first accessed.

## Try It

1. Set up environment variables for a project: create a `.env` file with `DATABASE_URL` (private), `API_SECRET` (private), `PUBLIC_API_URL` (public), and `PUBLIC_APP_NAME` (public). Import each from the correct `$env` module in a server route and a page component. Verify that importing a private variable in a client file produces a build error.

2. Create a `src/lib/server/env.ts` file that validates all your environment variables with Zod. Include at least one coerced number (like a port), one URL validation, and one string prefix check (like `sk_` for a Stripe key). Import from this file in a server route and confirm that invalid values produce clear error messages.

3. Implement a simple feature flag system: add three feature flags to your `.env` file (one public, two private). Create a `isFeatureEnabled` utility function. Use a public flag to conditionally render a UI element and a private flag to toggle between two data-fetching strategies in a load function.

4. Add path aliases for `$components` and `$server` in `svelte.config.js`, and set `prerender: true` on a marketing layout with an override for a dynamic pricing page.

## Key Takeaways

- SvelteKit provides four `$env` modules split by build/runtime and server/client access — choose the right one based on when the value is known and who needs it
- `$env/static/private` is the safest for secrets — values are inlined at build time and never reach the client; importing in client code causes a build error
- Public env vars require a `PUBLIC_` prefix, acting as a deliberate, loud reminder that the value is exposed to anyone who views the page source
- Use static env for values known at build time (zero runtime overhead); dynamic env for values that change per deployment
- Validate all environment variables at startup with Zod to catch configuration errors before they cause runtime failures
- Create a single `config.ts` file that validates and exports typed configuration — this becomes the single source of truth
- `.env.local` files are gitignored for local overrides; commit `.env.example` with empty values so developers know what to set up
- Feature flags can be as simple as environment variables checked with a utility function, or as complex as per-user rollout percentages
- In production, use your platform's secrets management (Vercel dashboard, Docker secrets, Kubernetes Secrets) instead of `.env` files on disk
- `svelte.config.js` controls adapters, aliases, CSRF protection, prerendering, and app versioning
- Page options (`ssr`, `csr`, `prerender`, `trailingSlash`) cascade from layouts to pages, with child overrides winning
- Custom `+error.svelte` pages at different route levels provide section-specific error experiences
- The `updated` store detects when a new version is deployed, allowing you to prompt users to reload
