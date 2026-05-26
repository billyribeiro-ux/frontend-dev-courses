# Advanced Routing

SvelteKit's file-based router handles far more than simple pages. You can validate route parameters with custom matchers, create sophisticated layout hierarchies with route groups, break out of inherited layouts, use optional and rest parameters, control rendering per-route, stream slow data, and organize complex applications with hundreds of routes. These advanced routing features let you build the kind of URL architecture that large, production applications demand — clean URLs with proper validation, shared chrome without URL pollution, and fine-grained control over server and client rendering.

## Route Matchers

Route matchers validate dynamic parameters before a route is matched. Without matchers, `/products/[id]` matches `/products/42` and `/products/abc` equally — your load function has to handle the invalid case. With matchers, invalid params never reach your code.

Create matcher files in `src/params/`:

```typescript
// src/params/integer.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^\d+$/.test(param);
};
```

Reference the matcher in your route directory name:

```
src/routes/products/[id=integer]/+page.svelte
```

Now `/products/42` matches, but `/products/abc` falls through. SvelteKit continues looking for other matching routes or renders a 404.

### Practical Matchers

Here are matchers you will use in real projects:

```typescript
// src/params/slug.ts — URL-safe slugs
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(param);
};
```

```typescript
// src/params/uuid.ts — UUID v4
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(param);
};
```

```typescript
// src/params/locale.ts — supported languages
import type { ParamMatcher } from '@sveltejs/kit';

const LOCALES = new Set(['en', 'fr', 'de', 'es', 'ja', 'pt']);

export const match: ParamMatcher = (param) => {
  return LOCALES.has(param);
};
```

```typescript
// src/params/date.ts — YYYY-MM-DD format
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return false;
  const date = new Date(param);
  return !isNaN(date.getTime());
};
```

### Matcher Priority and Disambiguation

When multiple routes could match a URL, matchers help SvelteKit choose the right one. Consider this structure:

```
src/routes/
  blog/
    [slug=slug]/+page.svelte      ← matches /blog/hello-world
    [id=integer]/+page.svelte     ← matches /blog/42
    archive/+page.svelte          ← matches /blog/archive
```

SvelteKit tries routes in this order:

1. Static segments first (`archive`)
2. Dynamic segments with matchers, in filesystem order
3. Dynamic segments without matchers

If `/blog/42` is requested, the `[id=integer]` route matches because `42` passes the integer matcher. The `[slug=slug]` route also receives `42`, but `42` is a valid slug too. SvelteKit resolves ambiguity by filesystem order within the same specificity level. To avoid confusion, design your matchers so they do not overlap — make `slug` reject pure numbers:

```typescript
// src/params/slug.ts — reject pure numbers to avoid overlap
export const match: ParamMatcher = (param) => {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(param) && !/^\d+$/.test(param);
};
```

## Route Groups

Route groups use parentheses `(groupname)` to organize routes without affecting the URL. The group folder name never appears in the URL path.

### Shared Layouts Without URL Impact

The primary use case is sharing a layout among routes that do not share a URL prefix:

```
src/routes/
  (marketing)/
    +layout.svelte           ← Marketing layout (centered, no sidebar)
    +page.svelte             ← / (homepage)
    about/
      +page.svelte           ← /about
    pricing/
      +page.svelte           ← /pricing
    blog/
      +page.svelte           ← /blog
  (app)/
    +layout.svelte           ← App layout (sidebar, user menu)
    +layout.server.ts        ← Auth check — redirect if not logged in
    dashboard/
      +page.svelte           ← /dashboard
    settings/
      +page.svelte           ← /settings
    projects/
      [id]/
        +page.svelte         ← /projects/123
  (auth)/
    +layout.svelte           ← Auth layout (centered card)
    login/
      +page.svelte           ← /login
    register/
      +page.svelte           ← /register
```

Three completely different layouts — marketing, app, and auth — without any URL prefixes. The homepage at `/` gets the marketing layout. The dashboard at `/dashboard` gets the app layout with a sidebar. Login at `/login` gets the centered auth card layout.

Each group has its own `+layout.svelte`, so changes to the app layout (like adding a sidebar) never affect marketing pages.

### Layout Files in Route Groups

The layout inside a route group applies to all routes in that group:

```svelte
<!-- src/routes/(marketing)/+layout.svelte -->
<script lang="ts">
  let { children } = $props();
</script>

<header class="marketing-header">
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/pricing">Pricing</a>
    <a href="/login">Sign in</a>
  </nav>
</header>

<main class="marketing-content">
  {@render children()}
</main>

<footer class="marketing-footer">
  <p>&copy; 2025 Acme Corp</p>
</footer>
```

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<div class="app-shell">
  <aside class="sidebar">
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/projects">Projects</a>
      <a href="/settings">Settings</a>
    </nav>
    <div class="user-info">
      <span>{data.user.name}</span>
    </div>
  </aside>

  <main class="app-content">
    {@render children()}
  </main>
</div>
```

### Using Groups for Auth Boundaries

A common pattern is using a route group with a layout server load function to protect an entire section:

```typescript
// src/routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  return { user: locals.user };
};
```

Every route inside `(app)` requires authentication. If the user is not logged in, they are redirected before any page in the group renders.

## Breaking Out of Layouts

Sometimes a page needs to escape its parent layout. SvelteKit lets you reset the layout hierarchy using the `@` suffix on page files.

### The Problem

Consider this structure:

```
src/routes/
  +layout.svelte              ← Root layout (header, footer)
  (app)/
    +layout.svelte            ← App layout (sidebar)
    settings/
      +layout.svelte          ← Settings layout (settings tabs)
      profile/
        +page.svelte          ← Nested inside three layouts!
```

The profile page inherits all three layouts: root, app, and settings. But what if you want a full-screen profile editor that escapes the settings tabs and sidebar?

### Breaking to a Specific Layout

Use `+page@layoutname.svelte` where `layoutname` is the route group or segment you want to reset to:

```
src/routes/
  +layout.svelte                        ← Root layout
  (app)/
    +layout.svelte                      ← App layout
    settings/
      +layout.svelte                    ← Settings layout
      profile/
        +page.svelte                    ← Normal: root > app > settings
        +page@(app).svelte              ← Breaks to: root > app (skips settings)
```

`+page@(app).svelte` renders inside the `(app)` layout, skipping the settings layout. The `@(app)` means "render at the (app) layout level."

### Breaking to the Root Layout

Use `+page@.svelte` (empty after the `@`) to reset to the root layout:

```
settings/
  profile/
    +page@.svelte           ← Renders inside root layout only
```

This is useful for full-screen experiences like onboarding flows, print views, or embedded content:

```svelte
<!-- src/routes/(app)/settings/profile/+page@.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<!-- Full-screen profile editor — no sidebar, no settings tabs -->
<div class="fullscreen-editor">
  <h1>Edit Profile</h1>
  <form method="POST">
    <input name="name" value={data.user.name} />
    <button>Save</button>
  </form>
  <a href="/settings">Back to settings</a>
</div>
```

### Layout Resets Apply to the Whole Chain

When you break to a specific layout, you also skip all data loading for the skipped layouts. If the settings layout loads settings data, that data is not available in `+page@(app).svelte`. Plan accordingly.

Layout resets also work on `+layout@.svelte` — a layout can reset its own parent chain, and all its child pages inherit the reset.

## Optional Parameters

Optional parameters use double brackets `[[param]]`. The route matches both with and without the segment:

```
src/routes/[[lang]]/about/+page.svelte
```

This matches `/about` and `/en/about` and `/fr/about`. When the segment is missing, the parameter is `undefined`:

```typescript
// src/routes/[[lang]]/about/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const locale = params.lang ?? 'en'; // Default to English
  const content = await loadContent('about', locale);
  return { content, locale };
};
```

### Optional Parameters with Matchers

Combine optional parameters with matchers for safety:

```
src/routes/[[lang=locale]]/+layout.svelte
```

Now `/about` matches (lang is undefined, defaults to English). `/fr/about` matches (lang is 'fr'). `/xyz/about` does not match (xyz fails the locale matcher), so SvelteKit tries other routes.

This prevents ambiguity. Without the matcher, `/products/about` would incorrectly match with `lang = 'products'`.

### Internationalized Routing

A complete i18n routing setup:

```
src/routes/
  [[lang=locale]]/
    +layout.svelte
    +layout.server.ts
    +page.svelte              ← / and /fr and /de
    about/
      +page.svelte            ← /about and /fr/about and /de/about
    blog/
      [slug]/
        +page.svelte          ← /blog/post and /fr/blog/post
```

```typescript
// src/routes/[[lang=locale]]/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
  const locale = params.lang ?? 'en';
  const translations = await loadTranslations(locale);

  return {
    locale,
    translations
  };
};
```

## Rest Parameters

Rest parameters use `[...name]` and capture multiple path segments. The parameter value is a string containing all remaining segments joined by `/`:

```
src/routes/docs/[...path]/+page.svelte
```

This matches `/docs`, `/docs/getting-started`, `/docs/api/routing`, and `/docs/api/routing/advanced`.

```typescript
// src/routes/docs/[...path]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // params.path = "api/routing/advanced" (or "" for /docs)
  const segments = params.path ? params.path.split('/') : [];

  const doc = await loadDocument(params.path || 'index');
  const sidebar = await loadSidebar();

  return {
    doc,
    sidebar,
    breadcrumbs: segments
  };
};
```

### Rest Parameters for Catch-All Routes

A common pattern is using rest parameters as a catch-all for 404 pages with custom logic:

```
src/routes/[...catchall]/+page.svelte
```

```typescript
// src/routes/[...catchall]/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';

const REDIRECTS: Record<string, string> = {
  'old-blog': '/blog',
  'team': '/about',
  'docs/v1/api': '/docs/api'
};

export const load: PageServerLoad = async ({ params }) => {
  const redirectTo = REDIRECTS[params.catchall];
  if (redirectTo) {
    throw redirect(301, redirectTo);
  }

  throw error(404, { message: 'Page not found' });
};
```

### Rest Parameters with Matchers

You can apply matchers to rest parameters:

```typescript
// src/params/filepath.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  // Only match paths that look like file paths (no double slashes, no dots at start)
  return /^[a-z0-9][a-z0-9\-\/]*$/.test(param);
};
```

```
src/routes/docs/[...path=filepath]/+page.svelte
```

## Route Sorting and Priority

When multiple routes could match a URL, SvelteKit resolves ambiguity with these rules (in order):

1. **More specific routes win** — `/blog/archive` beats `/blog/[slug]`
2. **Static segments beat dynamic segments** — `archive` beats `[slug]`
3. **Segments with matchers beat segments without** — `[id=integer]` beats `[id]`
4. **Regular params beat rest params** — `[slug]` beats `[...rest]`
5. **Required params beat optional params** — `[lang]` beats `[[lang]]`
6. **Filesystem order** — when all else is equal, alphabetical order

Understanding this is critical for designing routes that do not conflict:

```
src/routes/
  blog/
    archive/+page.svelte       ← /blog/archive (1st priority — static)
    [slug=slug]/+page.svelte   ← /blog/my-post (2nd — dynamic with matcher)
    [id=integer]/+page.svelte  ← /blog/42 (2nd — dynamic with matcher)
    [...path]/+page.svelte     ← /blog/a/b/c (3rd — rest parameter)
```

For `/blog/archive`, the static route wins. For `/blog/42`, both `[slug=slug]` and `[id=integer]` are dynamic-with-matcher, so the one whose matcher passes first wins. Design matchers to be mutually exclusive to avoid this ambiguity.

## Page Options

Every `+page.ts`, `+page.server.ts`, or `+layout.ts` file can export constants that control rendering:

```typescript
// src/routes/dashboard/+page.ts

export const ssr = false;              // No server-side rendering
export const csr = true;              // Client-side rendering (default)
export const prerender = false;        // Do not prerender at build time
export const trailingSlash = 'never';  // Strip trailing slashes
```

### ssr

Controls whether the page is rendered on the server. Set `ssr = false` for pages that depend on browser APIs:

```typescript
// src/routes/canvas-editor/+page.ts
export const ssr = false; // This page uses Canvas API — SSR would fail
```

When `ssr` is `false`, SvelteKit sends a minimal HTML shell and the component renders entirely in the browser. This means no SEO content, no content for users with JavaScript disabled, and slower first paint. Use sparingly.

### csr

Controls whether SvelteKit hydrates the page on the client. When `false`, the page is pure static HTML — no JavaScript runs:

```typescript
// src/routes/terms/+page.ts
export const csr = false; // Pure HTML — no interactive features needed
```

Setting `csr = false` sends zero JavaScript for this page. Links still work (they become full page navigations). This is excellent for legal pages, privacy policies, and content that needs no interactivity.

### prerender

Generates the HTML at build time. The page becomes a static file served directly by the hosting platform:

```typescript
// src/routes/marketing/+layout.ts
export const prerender = true; // All marketing pages are static

// src/routes/marketing/pricing/+page.ts
export const prerender = false; // Except pricing — it needs live data
```

Prerendered pages are the fastest possible — they require no server at all. Use for landing pages, documentation, blog posts.

### trailingSlash

Controls whether URLs end with a slash:

```typescript
export const trailingSlash = 'never';  // /about (redirects /about/ to /about)
export const trailingSlash = 'always'; // /about/ (redirects /about to /about/)
export const trailingSlash = 'ignore'; // Both work
```

### Layout-Level Options

Options set in a layout apply to all child pages. Children can override:

```typescript
// src/routes/+layout.ts
export const ssr = true;                // SSR enabled globally
export const trailingSlash = 'never';   // No trailing slashes globally

// src/routes/admin/+layout.ts
export const prerender = false;         // Never prerender admin pages

// src/routes/docs/+layout.ts
export const prerender = true;          // Prerender all docs
```

## API Route Organization

API routes (`+server.ts`) follow the same filesystem conventions. Here are production patterns:

```
src/routes/
  api/
    v1/
      users/
        +server.ts              ← GET /api/v1/users, POST /api/v1/users
        [id=uuid]/
          +server.ts            ← GET/PUT/DELETE /api/v1/users/:id
          avatar/
            +server.ts          ← GET/PUT /api/v1/users/:id/avatar
      projects/
        +server.ts
        [id=integer]/
          +server.ts
          members/
            +server.ts
    webhooks/
      stripe/
        +server.ts             ← POST /api/webhooks/stripe
      github/
        +server.ts             ← POST /api/webhooks/github
```

```typescript
// src/routes/api/v1/users/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = parseInt(url.searchParams.get('limit') ?? '20');

  const users = await db.users.findMany({
    skip: (page - 1) * limit,
    take: limit
  });

  return json({ users, page, limit });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) throw error(403, 'Forbidden');

  const body = await request.json();
  const user = await db.users.create({ data: body });

  return json(user, { status: 201 });
};
```

## Sitemap Generation

Use a server route with prerendering for automatic sitemap generation:

```typescript
// src/routes/sitemap.xml/+server.ts
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () => {
  const staticPages = [
    '',
    '/about',
    '/pricing',
    '/blog',
    '/contact'
  ];

  const blogPosts = await getAllBlogSlugs();
  const products = await getAllProductSlugs();

  const pages = [
    ...staticPages.map(path => ({
      path,
      lastmod: new Date().toISOString(),
      priority: path === '' ? '1.0' : '0.8'
    })),
    ...blogPosts.map(slug => ({
      path: `/blog/${slug}`,
      lastmod: new Date().toISOString(),
      priority: '0.6'
    })),
    ...products.map(slug => ({
      path: `/products/${slug}`,
      lastmod: new Date().toISOString(),
      priority: '0.7'
    }))
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(p => `
  <url>
    <loc>https://example.com${p.path}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <priority>${p.priority}</priority>
  </url>`).join('')}
</urlset>`;

  return new Response(sitemap.trim(), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=3600'
    }
  });
};
```

## Complete Multi-Layout Application

Here is a production-grade route structure that demonstrates all the advanced patterns:

```
src/routes/
  +layout.svelte                          ← Root layout (minimal: analytics, error boundary)
  +layout.server.ts                       ← Load user from session for all routes
  +error.svelte                           ← Root error page

  (marketing)/
    +layout.svelte                        ← Marketing chrome (nav, footer, CTA)
    +page.svelte                          ← /
    about/+page.svelte                    ← /about
    pricing/+page.svelte                  ← /pricing
    blog/
      +page.svelte                        ← /blog (listing)
      [slug=slug]/+page.svelte            ← /blog/hello-world

  (auth)/
    +layout.svelte                        ← Centered card layout
    login/
      +page.svelte                        ← /login
      +page.server.ts
    register/
      +page.svelte                        ← /register
      +page.server.ts
    forgot-password/
      +page.svelte                        ← /forgot-password

  (app)/
    +layout.svelte                        ← App shell (sidebar, header, user menu)
    +layout.server.ts                     ← Auth guard — redirects to /login
    dashboard/
      +page.svelte                        ← /dashboard
    projects/
      +page.svelte                        ← /projects (listing)
      new/+page.svelte                    ← /projects/new
      [id=integer]/
        +layout.svelte                    ← Project layout (project nav tabs)
        +page.svelte                      ← /projects/123 (overview)
        settings/+page.svelte             ← /projects/123/settings
        members/+page.svelte              ← /projects/123/members
        +error.svelte                     ← Project-specific error page
    settings/
      +layout.svelte                      ← Settings layout (settings sidebar)
      +page.svelte                        ← /settings (general)
      profile/
        +page.svelte                      ← /settings/profile
        +page@(app).svelte                ← Full-screen profile editor (breaks out of settings layout)
      billing/+page.svelte                ← /settings/billing
      team/+page.svelte                   ← /settings/team

  (admin)/
    +layout.svelte                        ← Admin layout (different sidebar)
    +layout.server.ts                     ← Admin guard — checks role
    admin/
      +page.svelte                        ← /admin
      users/
        +page.svelte                      ← /admin/users
        [id=integer]/+page.svelte         ← /admin/users/42
      +error.svelte                       ← Admin error page

  [[lang=locale]]/
    docs/
      [...path=filepath]/
        +page.svelte                      ← /docs/*, /fr/docs/*, /de/docs/*

  api/
    v1/
      users/+server.ts
      projects/+server.ts

  sitemap.xml/+server.ts
```

Key design decisions in this structure:

1. **Route groups isolate layouts** — marketing, auth, app, and admin each get their own visual chrome without URL pollution.
2. **Auth boundaries are layout-level** — the `(app)` group's layout server load redirects unauthenticated users, protecting all child pages automatically.
3. **Layout resets for full-screen experiences** — the profile editor at `+page@(app).svelte` escapes the settings layout for a full-width editor.
4. **Matchers prevent invalid routes** — `[id=integer]` ensures only numeric IDs reach the load function; `[slug=slug]` ensures URL-safe slugs.
5. **Scoped error pages** — the admin section has its own error page with admin-specific messaging.
6. **i18n via optional parameters** — docs support locale prefixes without duplicating routes.
7. **API versioning** — API routes are organized under `/api/v1/` for future versioning.

## Try It

Create a product catalog with these advanced routing features:

1. A route matcher at `src/params/integer.ts` that validates product IDs, and a `src/params/slug.ts` that validates category slugs.
2. A route group `(shop)` with its own layout (product navigation, cart indicator).
3. Routes: `/products` (listing), `/products/[id=integer]` (detail), `/products/[id=integer]/reviews` (reviews tab).
4. A `+error.svelte` inside the products directory that suggests similar products.
5. A dashboard page (in an `(app)` group with auth guard) that streams slow analytics data alongside fast user data using `{#await}`.
6. An optional `[[lang=locale]]` parameter on the marketing pages.
7. A `/docs/[...path]` catch-all route for documentation.
8. Add `data-sveltekit-preload-data="hover"` to your product listing links.
9. A `sitemap.xml` server route that generates an XML sitemap of all public pages.

## Key Takeaways

- Route matchers in `src/params/` validate dynamic segments before matching — invalid params never reach your load functions
- Design matchers to be mutually exclusive to avoid ambiguity between overlapping dynamic routes
- Route groups `(name)` share layouts without affecting URLs — use them to isolate marketing, app, auth, and admin layouts
- Breaking out of layouts with `+page@group.svelte` or `+page@.svelte` lets specific pages escape the layout hierarchy
- Optional parameters `[[param]]` match with or without the segment — combine with matchers for i18n routing
- Rest parameters `[...rest]` capture multiple path segments — use for docs, catch-all redirects, and file-path-like URLs
- SvelteKit resolves route ambiguity by specificity: static > dynamic-with-matcher > dynamic > rest > optional
- Page options (`ssr`, `csr`, `prerender`, `trailingSlash`) cascade from layouts to pages, with the most specific setting winning
- API routes follow the same filesystem conventions — organize with versioning and meaningful resource hierarchies
- Prerendered sitemap routes give you SEO benefits with zero runtime cost
