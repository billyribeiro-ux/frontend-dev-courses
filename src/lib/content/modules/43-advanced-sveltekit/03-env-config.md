# Environment & Config

Every application needs configuration: API keys, database URLs, feature flags, and deployment-specific settings. Getting these wrong is a security risk — leak a private API key to the client and it is compromised forever. SvelteKit provides four `$env` modules that make it impossible to accidentally expose secrets, plus a rich configuration system in `svelte.config.js` for controlling how your app builds and runs.

## The Four $env Modules

SvelteKit splits environment variables along two axes: **static vs dynamic** and **private vs public**. This creates four modules, each with different characteristics.

### $env/static/private

Build-time, server-only. These values are read from your `.env` file at build time and replaced inline in the code. They never appear in client bundles:

```typescript
// src/routes/api/data/+server.ts
import { DATABASE_URL, API_SECRET } from '$env/static/private';

export async function GET() {
  // DATABASE_URL and API_SECRET are inlined at build time
  const db = connect(DATABASE_URL);
  const data = await fetchExternal(API_SECRET);
  return new Response(JSON.stringify(data));
}
```

If you try to import `$env/static/private` in a client-side file, SvelteKit throws a build error. This is a guardrail, not a convention — it is physically impossible to leak these values to the browser.

### $env/static/public

Build-time, available on the client. Variables must start with `PUBLIC_` (configurable). They are embedded in the client bundle:

```svelte
<!-- Available in any .svelte file -->
<script>
  import { PUBLIC_API_URL, PUBLIC_APP_NAME } from '$env/static/public';
</script>

<h1>Welcome to {PUBLIC_APP_NAME}</h1>
```

Use this for values the client needs: public API endpoints, analytics IDs, feature flags. Never put secrets here — the `PUBLIC_` prefix is a deliberate reminder.

### $env/dynamic/private

Runtime, server-only. These values are read from `process.env` at request time, not at build time. Use them when the value changes per deployment or environment without a rebuild:

```typescript
// src/routes/api/status/+server.ts
import { env } from '$env/dynamic/private';

export async function GET() {
  // Read at runtime — can change without rebuilding
  const region = env.DEPLOY_REGION;
  const version = env.APP_VERSION;

  return new Response(JSON.stringify({ region, version }));
}
```

### $env/dynamic/public

Runtime, available on the client. Like dynamic/private but accessible in the browser:

```svelte
<script>
  import { env } from '$env/dynamic/public';
</script>

<footer>Region: {env.PUBLIC_DEPLOY_REGION}</footer>
```

## When to Use Each Module

| Module | Build/Runtime | Server/Client | Use For |
|--------|--------------|---------------|---------|
| `static/private` | Build | Server only | API keys, DB URLs, secrets |
| `static/public` | Build | Both | Public API URL, app name, analytics ID |
| `dynamic/private` | Runtime | Server only | Region, version, runtime flags |
| `dynamic/public` | Runtime | Both | Runtime feature flags, CDN URLs |

Prefer **static** when the value is known at build time — it is more efficient because the value is inlined and tree-shaken. Use **dynamic** when the same build artifact deploys to multiple environments (staging, production) with different configuration.

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
      dir: './',           // Where to find .env files
      publicPrefix: 'PUBLIC_'  // Default prefix for public env vars
    },

    prerender: {
      crawl: true,          // Follow links to discover pages
      entries: ['*'],       // Start points for crawling
      handleHttpError: 'warn'
    },

    version: {
      name: Date.now().toString()  // Changes every build
    }
  }
};

export default config;
```

### Adapters

The adapter determines where and how your app runs:

- `@sveltejs/adapter-vercel` — Vercel (serverless functions, edge)
- `@sveltejs/adapter-node` — Any Node.js server (Docker, VPS)
- `@sveltejs/adapter-static` — Static site generation (no server)
- `@sveltejs/adapter-cloudflare` — Cloudflare Workers/Pages

### Path Aliases

The `alias` option creates shortcuts beyond the built-in `$lib`. This keeps imports clean in large projects:

```typescript
// Instead of: import Button from '../../../lib/components/Button.svelte'
import Button from '$components/Button.svelte';
```

### Version and the Updated Store

The `version.name` config powers SvelteKit's `updated` store from `$app/stores`. When you deploy a new version, SvelteKit can detect it and prompt the user to reload:

```svelte
<script>
  import { updated } from '$app/stores';
</script>

{#if $updated}
  <div class="update-banner">
    A new version is available.
    <button onclick={() => location.reload()}>Reload</button>
  </div>
{/if}
```

## Page Options Composition

Page options — `ssr`, `csr`, `prerender`, and `trailingSlash` — can be set in `+page.ts`, `+page.server.ts`, or `+layout.ts`. Layout-level options cascade down to all child pages:

```typescript
// src/routes/+layout.ts
export const ssr = true;        // SSR enabled for all pages
export const trailingSlash = 'never';

// src/routes/app/+layout.ts
export const ssr = true;
export const csr = true;        // Full SPA behavior for /app/*

// src/routes/app/dashboard/+page.ts
export const prerender = false;  // This specific page cannot be prerendered
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

## Try It

Set up environment variables for a project: create a `.env` file with `DATABASE_URL` (private), `API_SECRET` (private), `PUBLIC_API_URL` (public), and `PUBLIC_APP_NAME` (public). Import each from the correct `$env` module in a server route and a page component. Add path aliases for `$components` and `$server` in `svelte.config.js`, and set `prerender: true` on a marketing layout with an override for a dynamic pricing page.

## Key Takeaways

- SvelteKit provides four `$env` modules split by build/runtime and server/client access
- `$env/static/private` is the safest for secrets — values are inlined at build time and never reach the client
- Public env vars require a `PUBLIC_` prefix, acting as a deliberate reminder that the value is exposed
- Use static env for values known at build time; dynamic env for values that change per deployment
- `svelte.config.js` controls adapters, aliases, CSRF protection, prerendering, and app versioning
- Page options (`ssr`, `csr`, `prerender`, `trailingSlash`) cascade from layouts to pages, with child overrides winning
- Custom `+error.svelte` pages at different route levels provide section-specific error experiences
