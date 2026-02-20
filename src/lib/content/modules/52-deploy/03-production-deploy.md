# Production Deployment

This is it. TeamBoard is accessible, tested, and performant. The Kanban board drags and drops, real-time updates stream in, notifications slide and fade, the PWA works offline, and every form validates on both client and server. What remains is the final step: taking this application from your development machine to a production URL that your team can use.

But deployment is not just running a build command. It is the last quality gate — the place where environment variables, security headers, error handling, and caching all have to be right. This lesson walks through the full production deployment process, then steps back to look at everything you have built across Phase 7.

## Pre-Deploy Checklist

Before building, audit the configuration that matters in production.

### Environment Variables Audit

Svelte Kit provides four `$env` modules. Each has a specific purpose, and mixing them up in production can leak secrets or break the build:

```typescript
// $env/static/private — build-time secrets, NEVER sent to browser
// Inlined during build, tree-shaken from client bundles
import { DATABASE_URL, SESSION_SECRET } from '$env/static/private';
// Used in: hooks.server.ts, *.remote.ts, +page.server.ts

// $env/static/public — build-time public values, safe for browser
import { PUBLIC_APP_NAME, PUBLIC_SENTRY_DSN } from '$env/static/public';
// Used in: any component, +layout.svelte, client-side code

// $env/dynamic/private — runtime secrets, read from process.env
import { env } from '$env/dynamic/private';
// env.DATABASE_URL — useful when the value differs per deployment slot
// Used in: hooks.server.ts, server-only modules

// $env/dynamic/public — runtime public values
import { env } from '$env/dynamic/public';
// env.PUBLIC_API_URL — can change without rebuilding
// Used in: client or server code
```

**Audit checklist:**

- Verify `DATABASE_URL` and `SESSION_SECRET` are imported from `$env/static/private` or `$env/dynamic/private` — never from a public module
- Verify `PUBLIC_` prefixed variables are the only ones used in client-side code
- Confirm all required environment variables are listed in your deployment platform's settings
- Check that `.env` is in `.gitignore` and never committed

### Error Pages Audit

Every layout group should have its own `+error.svelte`:

```
src/routes/
├── +error.svelte              ← root fallback for unhandled errors
├── (auth)/
│   └── +error.svelte          ← error during login/signup
├── (app)/
│   ├── +error.svelte          ← error in authenticated app
│   └── [teamSlug]/
│       └── +error.svelte      ← error within a team context
```

Each error page should display the error status, message, and an error ID from `handleError`:

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? 'Something went wrong'}</p>

  {#if page.error?.id}
    <p class="error-id">
      Error ID: <code>{page.error.id}</code>
    </p>
    <p class="error-help">
      If this keeps happening, share this error ID with support.
    </p>
  {/if}

  <a href="/dashboard">Return to Dashboard</a>
</div>
```

### Security Audit

Verify the security headers in your `handle` hook and CSRF settings in the config:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss:"
  );

  return response;
};
```

```javascript
// svelte.config.js — CSRF protection
const config = {
  kit: {
    csrf: {
      checkOrigin: true // Enabled by default — verify it is not disabled
    }
  }
};
```

With `checkOrigin: true`, SvelteKit rejects POST/PUT/PATCH/DELETE requests where the `Origin` header does not match the server's origin. This prevents cross-site request forgery without tokens.

## Adapter Configuration

The adapter determines how SvelteKit's build output is structured for your hosting platform. TeamBoard uses `adapter-vercel` for serverless deployment:

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      // Vercel-specific options
      runtime: 'nodejs22.x',
      regions: ['iad1'],       // US East — closest to your database
      memory: 1024,            // MB of memory per function
      maxDuration: 10          // seconds max execution time
    })
  }
};

export default config;
```

The adapter converts your SvelteKit application into the format Vercel expects: serverless functions for dynamic routes, static files for prerendered pages, and edge-optimized configuration for static assets.

**Alternative adapters** for different hosting needs:

```javascript
// Self-hosted with Node.js (Docker, VPS, Railway)
import adapter from '@sveltejs/adapter-node';
// Produces a standalone Node.js server in /build
// Run with: node build/index.js

// Static site (Netlify, GitHub Pages, S3)
import adapter from '@sveltejs/adapter-static';
// Pre-renders every page at build time
// No server needed — pure HTML/CSS/JS
// Only works if ALL routes can be prerendered

// Cloudflare Workers / Pages (edge computing)
import adapter from '@sveltejs/adapter-cloudflare';
// Deploys to Cloudflare's edge network
// Runs in V8 isolates, not Node.js — some Node APIs unavailable
```

The adapter is the only thing you change when moving between platforms. Your application code, components, routes, and hooks stay exactly the same.

## Build the Application

Run the production build:

```bash
npx vite build
```

The build output tells you everything you need to verify:

```
vite v6.x.x building SSR bundle for production...
✓ 127 modules transformed.

vite v6.x.x building client bundle for production...
✓ 94 modules transformed.

.svelte-kit/output/client/_app/immutable/entry/start-DxF3r4kA.js   2.41 kB │ gzip: 1.12 kB
.svelte-kit/output/client/_app/immutable/entry/app-B2k7gR9p.js     8.73 kB │ gzip: 3.44 kB
.svelte-kit/output/client/_app/immutable/chunks/index-Cp2Iyx8z.js  12.89 kB │ gzip: 5.21 kB
...

Prerendered pages:
  ✓ /login (1.2 kB)
  ✓ /signup (1.4 kB)
  ✓ /about (0.8 kB)
  ✓ /pricing (1.1 kB)

✓ built in 4.2s
```

**Check three things:**

1. **Prerendered pages** — verify that all static pages (`/login`, `/signup`, `/about`, `/pricing`) appear in the prerendered list. If one is missing, its `+page.ts` file is missing `export const prerender = true`.

2. **Bundle sizes** — the client JavaScript should be reasonable. If a chunk is unexpectedly large (over 50 kB gzipped), investigate what is being bundled. Common culprits: importing a server-only library in client code, or a large charting library that could be lazy-loaded.

3. **No build errors** — TypeScript errors, missing imports, and invalid config all surface here. Fix them before deploying.

## Deploy to Vercel

### Option 1: Git Integration (Recommended)

1. Push your repository to GitHub
2. Go to [vercel.com](https://vercel.com) and click "Add New Project"
3. Import your repository
4. Vercel auto-detects SvelteKit and configures the build command (`vite build`) and output directory
5. Set environment variables in the Vercel dashboard:

```
DATABASE_URL=postgresql://user:pass@host:5432/teamboard
SESSION_SECRET=a-long-random-string-at-least-32-chars
PUBLIC_APP_NAME=TeamBoard
PUBLIC_SENTRY_DSN=https://abc123@sentry.io/456
```

6. Click "Deploy"

Every future push to `main` triggers an automatic deployment. Pull requests get preview deployments with unique URLs.

### Option 2: Vercel CLI

For manual deployments or CI/CD pipelines:

```bash
# Install the Vercel CLI
npm install -g vercel

# Link your project (first time only)
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

The CLI is useful in CI pipelines where you want to deploy after tests pass:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx vitest run
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

## The "New Version Available" Banner

After you deploy a new version, users who have the app open in a tab are still running the old code. SvelteKit's `updated` store from `$app/stores` detects when a new version has been deployed and lets you prompt the user to refresh.

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { updated } from '$app/stores';
  import { onMount } from 'svelte';

  let showUpdateBanner = $state(false);

  // The updated store is set to true when SvelteKit detects a new version
  // during client-side navigation. This happens because each deployment
  // generates new hashed asset filenames.
  $effect(() => {
    if ($updated) {
      showUpdateBanner = true;
    }
  });

  // Optionally poll for updates every 5 minutes, even if the user
  // is not navigating. Useful for users who leave the board open all day.
  onMount(() => {
    const interval = setInterval(() => {
      updated.check();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  });

  function reloadApp() {
    location.reload();
  }
</script>

{#if showUpdateBanner}
  <div class="update-banner" role="alert">
    <p>A new version of TeamBoard is available.</p>
    <button onclick={reloadApp}>Refresh to update</button>
  </div>
{/if}

{@render children()}
```

How it works: SvelteKit generates a version hash based on the build output. On each client-side navigation, SvelteKit fetches a small manifest file and compares the version hash. If it has changed, `$updated` becomes `true`. The `updated.check()` method triggers this comparison manually, which is useful for long-running sessions where the user does not navigate frequently.

## Service Worker Cache Invalidation

In Module 51 you set up a service worker for offline support. When you deploy a new version, the old cached assets need to be cleaned up. SvelteKit's `$service-worker` module provides a `version` string that changes with each build:

```typescript
// src/service-worker.ts
import { version, files, build } from '$service-worker';

const CACHE_NAME = `teamboard-${version}`;

// Install: cache all new assets
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([...build, ...files]);
    })
  );
});

// Activate: delete old caches from previous versions
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

The `version` value from `$service-worker` is derived from the build hash. Each deployment produces a new `version`, which creates a new `CACHE_NAME`. The `activate` event then deletes all caches that do not match the new name. Old assets are purged, new assets are cached. Users get the latest code on the next page load.

## Production Error Monitoring

Errors in production need to be captured, tracked, and actionable. SvelteKit's `handleError` hook is the central place where all unhandled errors pass through — both server-side and client-side:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'crypto';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = randomUUID();

  // Log full error details for your monitoring service
  console.error(`[${errorId}]`, {
    status,
    message,
    url: event.url.pathname,
    method: event.request.method,
    error: error instanceof Error ? error.stack : error
  });

  // Send to your error tracking service (Sentry, LogSnag, etc.)
  // await reportToSentry({ errorId, error, event });

  // Return a safe error object to the client
  // The full error is NEVER sent to the browser — only the ID and message
  return {
    message: 'An unexpected error occurred',
    id: errorId
  };
};
```

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleClientError: HandleClientError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();

  console.error(`[${errorId}]`, error);

  // Send to client-side error tracking
  // await reportToSentry({ errorId, error });

  return {
    message: 'Something went wrong',
    id: errorId
  };
};
```

The error ID creates a traceable flow:

1. An error is thrown somewhere in the application
2. `handleError` catches it, generates a unique ID, and logs the full error with the ID
3. The `+error.svelte` page displays the error ID to the user
4. The user reports the error ID to support
5. Support searches logs for that error ID and finds the full stack trace

This pattern means you never expose stack traces or internal details to the user, but you always have a way to trace any reported error back to its source.

## Feature Retrospective

You have built a complete, production-grade project manager. Let us look at every Svelte 5 and SvelteKit feature taught in Phases 6 and 7 and see exactly where each one appeared in TeamBoard. This is not a review — it is proof that you used everything.

### Svelte 5 Runes

| Feature | Where in TeamBoard |
|---|---|
| `$state()` | Board columns, active task, drag state — deeply reactive data mutated during drag-and-drop and inline editing |
| `$state.raw()` | Full project task list, activity log — large datasets replaced wholesale on fetch, never mutated in place |
| `$state.snapshot()` | Serializing board state for API commands, localStorage offline backup, console debugging |
| `$derived` | Total task count, simple computed values from board state |
| `$derived.by()` | Column task counts, overdue tasks (with date filtering and sorting), sprint velocity (multi-step calculation) |
| `$effect` | WebSocket connection lifecycle, syncing board state on URL change, auto-saving draft tasks, update banner detection |
| `$effect.pre` | Scroll position preservation before DOM updates in the activity feed |
| `$props()` | Every component — TaskCard, BoardColumn, NotificationToast, all forms and modals |
| `$props.id()` | Task creation form, team settings form, comment form — SSR-safe unique IDs for label/input pairs |
| `$bindable()` | Filter inputs, inline task title editing, modal open state shared between parent and child |
| `$inspect()` | Development debugging of board state changes, tracking reactive dependency chains |

### Transitions & Animations

| Feature | Where in TeamBoard |
|---|---|
| `transition:fly` | Notification toasts sliding in from the right |
| `transition:fade` | Modal backdrop fade in/out |
| `transition:slide` | Sidebar expand/collapse, filter panel toggle |
| `in:` / `out:` | Task cards use `in:fly` when added, `out:fade` when removed — different enter and exit animations |
| `animate:flip` | Task card reordering within a column — smooth position animation after drag-and-drop reorder |
| Custom transition | Board column entrance with staggered delays — each column fades in 100ms after the previous one |

### Actions

| Feature | Where in TeamBoard |
|---|---|
| `draggable` action | Task cards — pointer event handling, CSS transforms, custom drag events |
| `droppable` action | Board columns — drop target highlighting, position calculation |
| `clickOutside` action | Modal dismissal, dropdown menu close, filter panel close |
| `tooltip` action | Task priority badges, assignee avatars, toolbar buttons — accessible hover/focus tooltips |
| `longPress` action | Mobile context menu on task cards — distinguishes tap from press-and-hold |
| Action with `update` | Drag action parameters update when task data changes without remounting |
| Action with `destroy` | All actions clean up event listeners and DOM mutations on component unmount |

### Special Elements

| Feature | Where in TeamBoard |
|---|---|
| `<svelte:window>` | Keyboard navigation handler (arrow keys, Enter, Escape), resize listener for responsive board layout |
| `<svelte:document>` | Click-outside detection at the document level, visibility change detection for pausing real-time sync |
| `<svelte:body>` | Preventing scroll during drag operations via `overflow: hidden` on `<body>` |
| `<svelte:head>` | Dynamic page titles (`Board Name - TeamBoard`), meta descriptions, Open Graph tags |
| `<svelte:element>` | Dynamic heading levels in reusable card components — `h2` in board view, `h3` in list view |
| `<svelte:component>` | Dynamic icon rendering based on task priority or notification type |

### Template Tags

| Feature | Where in TeamBoard |
|---|---|
| `{#each ...}` | Board columns, task lists, team members, notification history, activity log |
| `{#if ...}` | Conditional rendering of modals, empty states, loading indicators, auth-gated UI |
| `{#await ...}` | Streaming dashboard analytics, lazy-loaded team statistics |
| `{#key ...}` | Forcing re-render of board component when switching between boards via URL parameter change |
| `{#snippet ...}` | Reusable task card layout used in both board view and list view with different surrounding markup |
| `{@render ...}` | Rendering snippets and children in layout components |
| `{@html ...}` | Rendering sanitized markdown in task descriptions and comments |
| `{@const ...}` | Computing display values inside `{#each}` blocks — formatted dates, priority labels |

### SvelteKit Routing & Data

| Feature | Where in TeamBoard |
|---|---|
| `+page.svelte` / `+page.server.ts` | Every route — dashboard, board view, task detail, team settings |
| `+layout.svelte` / `+layout.server.ts` | Root layout (View Transitions), auth layout (centered), app layout (sidebar + header) |
| `+error.svelte` | Root error page, app error page, team error page — each with error ID display |
| `[param]` routes | `[teamSlug]`, `[boardId]`, `[taskId]` — dynamic segments throughout the app |
| `[...rest]` routes | API catch-all route for legacy redirect support |
| `(group)` layout groups | `(auth)` for login/signup, `(app)` for the authenticated shell |
| `+server.ts` | WebSocket upgrade endpoint, webhook receivers, health check endpoint |

### SvelteKit Hooks

| Feature | Where in TeamBoard |
|---|---|
| `handle` | Authentication check, security headers, request logging |
| `handleError` (server) | Error ID generation, error tracking service integration, safe error responses |
| `handleError` (client) | Client-side error capture and reporting |
| `handleFetch` | Adding auth headers to internal API calls during SSR |

### SvelteKit App Modules

| Feature | Where in TeamBoard |
|---|---|
| `$app/navigation` | `goto` for programmatic navigation after task creation, `pushState` for task modal URLs, `onNavigate` for View Transitions, `invalidate` for refreshing data |
| `$app/state` | `page` state for reading URL params, error info, and route data |
| `$app/stores` | `updated` store for new version detection |
| `$app/server` | `query()`, `form()`, `command()` remote functions for server-side data operations |
| `$app/environment` | `browser` check for client-only code, `dev` check for debug features |

### Remote Functions

| Feature | Where in TeamBoard |
|---|---|
| `query()` | Team list, project details, board data, task search, activity log |
| `form()` | Task creation, team settings update, comment submission — with Valibot validation schemas |
| `command()` | Move task, reorder columns, bulk task updates — write operations with `.updates()` for invalidation |
| `.updates()` | After `moveTask` command completes, automatically re-runs related `query()` functions to refresh the board |

### SvelteKit Configuration

| Feature | Where in TeamBoard |
|---|---|
| `ssr` | Enabled for app pages (performance), not relevant for API routes |
| `csr` | Enabled for all interactive pages (drag-and-drop, real-time updates require JavaScript) |
| `prerender` | Enabled for static pages (login, signup, about, pricing) — fastest possible TTFB |
| `$env/static/private` | `DATABASE_URL`, `SESSION_SECRET` — build-time secrets |
| `$env/static/public` | `PUBLIC_APP_NAME`, `PUBLIC_SENTRY_DSN` — build-time public values |
| `$env/dynamic/private` | Runtime secrets that vary per deployment environment |
| `data-sveltekit-preload-data` | Board links, task links — preload on hover for instant navigation |
| `data-sveltekit-noscroll` | Sort and filter controls — prevent scroll jump on URL update |
| `$service-worker` | `version`, `build`, `files` — cache management and invalidation on deploy |

That table is not theoretical. Every row corresponds to code you wrote in Modules 44 through 52. You did not just learn these features — you used them together, in a real application, to solve real problems.

## What You Built

Take a moment to appreciate the scope of what TeamBoard is:

- **Authentication** with session cookies, auth guards, and protected routes
- **Team management** with roles, invitations, and settings
- **Kanban boards** with drag-and-drop, keyboard navigation, and real-time collaboration
- **Task management** with priorities, assignees, due dates, comments, and activity history
- **Real-time updates** via WebSocket with optimistic UI and conflict resolution
- **Notifications** with transitions, auto-dismiss, and screen reader announcements
- **Dashboard analytics** with streaming data and computed velocity metrics
- **PWA support** with service worker caching, offline fallback, and install prompt
- **Accessibility** with keyboard navigation, ARIA attributes, focus management, and live regions
- **Testing** at every layer — unit, component, integration, and end-to-end
- **Production deployment** with environment variable management, error monitoring, and version detection

This is not a tutorial project. This is the architecture of applications like Linear, Trello, and Notion. The patterns you learned here — reactive state modules, remote functions, custom actions, real-time sync, progressive enhancement — are the same patterns used in production applications serving millions of users.

## Next Steps

You have finished the course. Here is where to go from here:

**Build your own project.** The best way to solidify what you learned is to build something real. Pick an idea that excites you — a habit tracker, a recipe manager, a budgeting app — and build it with SvelteKit. You will hit new problems, and solving them will deepen your understanding far more than any tutorial.

**Explore the Svelte ecosystem.** The community has built excellent libraries that complement what you know:

- **Paraglide** — internationalization (i18n) for SvelteKit. Type-safe translations, automatic language detection, and SEO-friendly URL-based locale switching.
- **Superforms** — advanced form handling with client-side validation, progressive enhancement, and multi-step forms. Built on top of SvelteKit's form actions.
- **Lucia** — authentication library that works with any database. Session management, OAuth providers, and password hashing with a clean API.
- **Melt UI** — headless UI components for Svelte. Accessible by default, unstyled, and composable. Great for building design systems.

**Contribute to open source.** The Svelte ecosystem is active and welcoming. Start by fixing a documentation issue, adding a test, or improving an error message. You now have the knowledge to read and contribute to any Svelte project.

**Stay current.** Svelte and SvelteKit are evolving. Follow the Svelte blog, join the Discord server, and read the changelogs. The foundations you learned here will not change — runes, actions, transitions, and SvelteKit's routing model are the core of Svelte going forward. New features will build on top of what you already know.

You started this course writing `<h1>Hello World</h1>` in a Svelte component. You are ending it by deploying a real-time collaborative project management application with drag-and-drop, authentication, offline support, accessibility, and a comprehensive test suite. That is a long way to travel, and you traveled it one lesson at a time.

Well done. Now go build something.

## Try It

1. Run the pre-deploy checklist on your project. Verify that all private environment variables are imported from `$env/static/private` or `$env/dynamic/private`. Check that every layout group has its own `+error.svelte`. Confirm `checkOrigin: true` in your CSRF settings.

2. Build your application with `npx vite build`. Check the output for prerendered pages and bundle sizes. If any bundle is larger than 50 kB gzipped, investigate what is being included.

3. Deploy to Vercel (or your preferred platform). Set all required environment variables. Verify the deployed application works by running through the critical user flow: login, navigate to a board, create a task, drag it, and add a comment.

4. Wire up the `updated` store in your app layout. Deploy a change, then navigate in the old tab to see the update banner appear. Click refresh and verify you are on the new version.

5. Test your error flow end-to-end: throw an intentional error in a load function, verify `handleError` generates an error ID, verify `+error.svelte` displays that ID, and verify you can find the full error in your server logs by searching for that ID.

6. Review the feature retrospective table. For each row, find the actual file in your project where that feature is used. If you skipped any feature, consider whether it would improve your application and add it.

## Key Takeaways

- Audit all four `$env` modules before deploying — secrets in public modules are the most common production security mistake
- Every layout group needs its own `+error.svelte` so users always see a styled, helpful error page with a traceable error ID
- The adapter is the only thing that changes between hosting platforms — your application code stays the same whether you deploy to Vercel, Cloudflare, or your own server
- `vite build` verifies everything at once: TypeScript types, import resolution, prerendered pages, and bundle sizes — fix all issues before deploying
- The `updated` store and `updated.check()` let you notify users of new deployments without forcing a page reload
- Service worker cache invalidation uses the `version` from `$service-worker` — each build produces a new version that triggers cleanup of old caches
- `handleError` is the production error pipeline: generate an ID, log the full error, send a safe message to the client, and trace reported errors back to their source
- TeamBoard used every major Svelte 5 feature: all runes, transitions, actions, special elements, template tags, hooks, app modules, remote functions, and configuration options
- The patterns from this project — reactive state modules, remote functions, custom actions, real-time sync, progressive enhancement — are the same patterns used in production applications at scale
- The best next step is to build your own project — pick an idea, start a SvelteKit app, and apply everything you learned
