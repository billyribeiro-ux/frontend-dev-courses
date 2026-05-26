# File-Based Routing

SvelteKit's routing system is built on a powerful idea: **your file system is your router configuration**. The files and folders you create inside `src/routes/` automatically become pages on your website. There is no router configuration file to maintain, no route registration, and no wiring. If the file exists, the route exists.

This is not a convenience shortcut layered on top of a "real" router. The file system _is_ the router. Every time you create, rename, or delete a file in `src/routes/`, you are directly modifying your application's routing table. This makes your project structure a living, browsable map of every URL your application can serve.

Want to know what pages your app has? Run `ls -R src/routes/` and you have your answer.

## How File-Based Routing Works Under the Hood

When you run `npm run dev` or `npm run build`, SvelteKit scans the `src/routes/` directory recursively. It builds a **route manifest** — a data structure mapping URL patterns to the files that handle them. This manifest includes:

1. Every `+page.svelte` and the URL pattern it matches
2. Every `+page.ts` / `+page.server.ts` and the data-loading function it exports
3. Every `+layout.svelte` and which routes it wraps
4. Every `+error.svelte` and which route segments it covers
5. Every `+server.ts` and the HTTP methods it handles
6. All parameter matchers from `src/params/`

During development, SvelteKit watches the filesystem with a file watcher (using Vite's built-in watcher, which uses `chokidar` under the hood). When you create, rename, or delete a route file, Vite triggers a hot-module reload and SvelteKit rebuilds the affected parts of the manifest. This is why you can create a new `+page.svelte` and instantly navigate to it without restarting the dev server.

At build time, this manifest is serialized and embedded into your application bundle. The client-side router uses it to know which components to load for each URL, enabling instant client-side navigation without requesting a full page from the server.

> **Production insight:** The route manifest is why SvelteKit can do code splitting automatically. Each `+page.svelte` becomes its own chunk. When a user navigates to `/about`, SvelteKit only downloads the JavaScript for the about page — not the entire application. The manifest tells the router exactly which chunks to fetch.

## The +page.svelte Convention

The file `src/routes/+page.svelte` is your home page. It maps to the root URL `/`:

```svelte
<!-- src/routes/+page.svelte → localhost:5173/ -->
<h1>Welcome to My Site</h1>
<p>This is the home page.</p>
```

The `+` prefix is critical. It tells SvelteKit "this is a route file, not a regular component." You can have other `.svelte` files in your route directories (helper components, for example), but only files starting with `+` have special routing meaning. This convention keeps the boundary clear: `+page.svelte` is a route, `Header.svelte` is just a component.

> **Why the `+` prefix?** Earlier versions of SvelteKit used different conventions. The `+` was chosen because it sorts to the top of directory listings (making route files easy to spot), it is a valid filename character on all operating systems, and it is visually distinctive enough that you will never accidentally create one. It is also unlikely to conflict with any component naming convention you might use.

## Every Route File Convention

SvelteKit recognizes several `+` files. Each plays a different role in the routing system. Understanding all of them is essential to building production applications. Here is the complete list:

### +page.svelte — The Visual Component

This is what the user sees. It is a regular Svelte component that renders the page content. It receives data from `+page.ts` or `+page.server.ts` via the `data` prop:

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>{data.title}</h1>
<p>{data.description}</p>
```

Every route must have a `+page.svelte`. Without it, the URL does not exist as a page (though it can still exist as an API endpoint via `+server.ts`).

### +page.ts — Universal Data Loading

This file exports a `load` function that runs on **both** the server (during SSR) and the client (during client-side navigation):

```typescript
// src/routes/about/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/about');
  const about = await response.json();

  return {
    title: about.title,
    description: about.description
  };
};
```

Use `+page.ts` when your data loading does not need server-only secrets or direct database access. The `fetch` function provided by SvelteKit is special — during SSR it makes the request directly (no HTTP overhead), and on the client it makes a real fetch request. It also handles cookies and credentials automatically.

### +page.server.ts — Server-Only Data Loading

This file's `load` function runs **only on the server**. It has access to things that must never be exposed to the client:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    error(401, 'You must be logged in');
  }

  const stats = await db.query('SELECT * FROM dashboard_stats WHERE user_id = $1', [locals.user.id]);

  return {
    stats
  };
};
```

Use `+page.server.ts` when you need:
- Direct database access
- Secret API keys or credentials
- Reading environment variables that should not be in the client bundle
- Server-only imports from `$lib/server/`
- Form actions (more on this later)

> **Critical distinction:** If both `+page.ts` and `+page.server.ts` exist for the same route, the server load runs first. Its return value is available to the universal load via the `data` property of the load function's argument. This is the data waterfall pattern — use it deliberately.

### +layout.svelte — Shared UI Wrapper

Layouts wrap pages with shared UI. A layout at `src/routes/+layout.svelte` wraps every page in your app. A layout at `src/routes/dashboard/+layout.svelte` wraps only pages under `/dashboard/`:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children } = $props<{ children: Snippet }>();
</script>

<header>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/dashboard">Dashboard</a>
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer>
  <p>&copy; 2026 My Company</p>
</footer>
```

The `{@render children()}` slot is where the page content (or a nested layout's content) appears. Layouts are **preserved across navigation** — if you navigate from `/about` to `/contact` and both use the root layout, the layout component is not destroyed and recreated. Only the page content inside `{@render children()}` changes. This is how SvelteKit avoids re-rendering your navigation, sidebar, and footer on every page transition.

### +layout.ts and +layout.server.ts — Layout Data Loading

These work exactly like their `+page` counterparts but for layouts. Data returned from a layout load function is available to the layout itself and **all child pages and layouts**:

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user  // Available to EVERY page via data.user
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

{#if data.user}
  <p>Welcome, {data.user.name}</p>
{/if}

{@render children()}
```

This is the canonical pattern for making user session data available across your entire application.

### +error.svelte — Error Boundaries

When a `load` function throws an error (or returns an error response), SvelteKit looks for the nearest `+error.svelte` to display:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
```

Error files bubble up. If `/blog/my-post` throws a 404 and there is no `src/routes/blog/+error.svelte`, SvelteKit checks `src/routes/+error.svelte`. If that does not exist either, SvelteKit uses a default error page. You can put `+error.svelte` at any level of your route tree to create granular error handling:

```bash
src/routes/
├── +error.svelte                    # Catches errors for all routes
├── +layout.svelte
├── blog/
│   ├── +error.svelte                # Catches errors only under /blog
│   ├── +page.svelte
│   └── [slug]/
│       └── +page.svelte
└── dashboard/
    ├── +error.svelte                # Catches errors only under /dashboard
    └── +page.svelte
```

> **Important subtlety:** The root layout (`src/routes/+layout.svelte`) cannot have a corresponding `+error.svelte` at the same level that catches errors *from the layout itself*. If your root layout's `load` function fails, the only fallback is `src/error.html` — a static HTML file with no access to Svelte components. This is the "nuclear fallback." Keep your root layout load functions simple and error-resistant.

### +server.ts — API Endpoints

This creates a standalone API endpoint (no page, no HTML). Export functions named after HTTP methods:

```typescript
// src/routes/api/posts/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';

export const GET: RequestHandler = async ({ url }) => {
  const limit = Number(url.searchParams.get('limit') ?? '10');
  const posts = await db.query('SELECT * FROM posts LIMIT $1', [limit]);

  return json(posts);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    error(401, 'Unauthorized');
  }

  const body = await request.json();
  const post = await db.query(
    'INSERT INTO posts (title, body, author_id) VALUES ($1, $2, $3) RETURNING *',
    [body.title, body.body, locals.user.id]
  );

  return json(post, { status: 201 });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const id = url.searchParams.get('id');
  if (!id) error(400, 'Missing id parameter');

  await db.query('DELETE FROM posts WHERE id = $1 AND author_id = $2', [id, locals.user.id]);

  return new Response(null, { status: 204 });
};
```

You can export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`. If a route has both `+page.svelte` and `+server.ts`, the page handles `GET` requests (browser navigation) and the server handles everything else. This is a common pattern for forms: `+page.svelte` renders the form, and `+server.ts` handles the API for programmatic access.

## Creating New Routes

To add a new page, create a folder with a `+page.svelte` file inside it. The folder name becomes the URL segment:

```bash
src/routes/
├── +page.svelte               # /
├── about/
│   └── +page.svelte           # /about
├── contact/
│   └── +page.svelte           # /contact
├── blog/
│   └── +page.svelte           # /blog
└── pricing/
    └── plans/
        └── +page.svelte       # /pricing/plans
```

```svelte
<!-- src/routes/about/+page.svelte -->
<h1>About Us</h1>
<p>We build things with SvelteKit.</p>
```

Notice how deeply nested folders map to deeper URL paths. `pricing/plans/+page.svelte` becomes `/pricing/plans`. The directory hierarchy and URL hierarchy are the same thing — this is the mental model to internalize. If you find yourself thinking "I need to add a route for `/settings/profile`", your hands should already be creating `src/routes/settings/profile/+page.svelte`.

A folder without a `+page.svelte` is not a route — it is just organizational structure. You can have `src/routes/settings/` exist as a folder that contains `profile/+page.svelte` and `account/+page.svelte` without `/settings` itself being a valid page. This is useful when you want a URL prefix that groups routes but does not need its own content.

### Co-Locating Components Alongside Routes

You can place regular Svelte components alongside route files. A file like `src/routes/blog/PostCard.svelte` is just a component — it will not become a route because it does not start with `+`. This lets you co-locate helper components with the routes that use them:

```bash
src/routes/blog/
├── +page.svelte                # The blog listing page
├── +page.server.ts             # Data loading for the blog
├── PostCard.svelte             # Helper component (NOT a route)
├── SearchBar.svelte            # Helper component (NOT a route)
├── blog.css                    # Shared styles (NOT a route)
└── [slug]/
    ├── +page.svelte            # Individual blog post page
    ├── +page.server.ts         # Data loading for the post
    ├── TableOfContents.svelte  # Helper component for posts
    └── ShareButton.svelte      # Helper component for posts
```

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  import PostCard from './PostCard.svelte';
  let { data } = $props();
</script>

<h1>Blog</h1>
<div class="grid">
  {#each data.posts as post}
    <PostCard {post} />
  {/each}
</div>
```

This co-location pattern keeps related code together. The alternative — putting everything in `$lib/components/` — works fine for truly shared components, but for components used by only one route, co-locating them is simpler and makes the code easier to find, reason about, and delete when the route changes.

> **Production opinion:** I co-locate components that are used by only one or two routes. Components shared across three or more routes go in `$lib/components/`. This prevents the `$lib/components/` directory from becoming a junk drawer of loosely related files.

## Dynamic Routes

Static routes only get you so far. What about `/blog/my-first-post` or `/users/42`? You cannot create a folder for every possible blog post. This is where **dynamic parameters** come in — wrap a folder name in square brackets to capture a variable segment:

```bash
src/routes/blog/[slug]/
└── +page.svelte               # /blog/anything-here
```

Inside the component, access the dynamic value through the `page` object from `$app/state` (the modern Svelte 5 API) or through the `data` prop populated by a load function:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  // If the URL is /blog/my-first-post, slug = "my-first-post"
  let slug = $derived(page.params.slug);
</script>

<h1>Blog Post: {slug}</h1>
```

In production, you will almost always use a `load` function to fetch the actual blog post data rather than reading the slug directly in the component:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  const post = await db.query('SELECT * FROM posts WHERE slug = $1', [params.slug]);

  if (!post) {
    error(404, `Post "${params.slug}" not found`);
  }

  return { post };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<article>
  <h1>{data.post.title}</h1>
  <div>{@html data.post.content}</div>
</article>
```

Dynamic parameters always arrive as strings. If your route is `/products/[id]` and the user visits `/products/42`, `params.id` is the string `"42"`, not the number `42`. Parse and validate it in your `load` function where you can throw a proper error for invalid values.

You can have multiple dynamic segments in a single path:

```bash
src/routes/products/[category]/[id]/
└── +page.svelte               # /products/shoes/42
```

```svelte
<script lang="ts">
  import { page } from '$app/state';

  // /products/shoes/42 → { category: "shoes", id: "42" }
  let category = $derived(page.params.category);
  let id = $derived(page.params.id);
</script>

<h1>{category} — Product #{id}</h1>
```

### Type Safety with Generated Types

SvelteKit generates TypeScript types for every route automatically. These types live in hidden `.svelte-kit/types/` directories that mirror your route structure. When you import from `./$types`, you get perfectly typed `params`, `data`, and `load` functions:

```typescript
// src/routes/products/[category]/[id]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // TypeScript knows:
  // params.category: string
  // params.id: string
  // params.nonexistent → compile error!
  return {
    category: params.category,
    productId: parseInt(params.id, 10)
  };
};
```

These types update automatically when you add, rename, or remove route parameters. They are one of SvelteKit's best DX features and the reason you should always use `lang="ts"` in your script tags.

### Parameter Matchers

By default, a dynamic parameter matches any string. The route `/blog/[slug]` will match `/blog/hello`, `/blog/123`, even `/blog/---`. You can constrain this with **parameter matchers**. Create a file in `src/params/`:

```typescript
// src/params/slug.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  // Only match lowercase letters, numbers, and hyphens
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(param);
};
```

Then reference the matcher in your route folder name with the `=` syntax:

```bash
src/routes/blog/[slug=slug]/
└── +page.svelte               # Only matches valid slugs
```

The format is `[paramName=matcherName]`. The matcher name corresponds to the filename in `src/params/` (without the `.ts` extension).

If a URL does not pass the matcher, SvelteKit skips that route and tries others. This is powerful for disambiguation:

```typescript
// src/params/integer.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^\d+$/.test(param);
};
```

```bash
src/routes/
├── users/
│   ├── [id=integer]/
│   │   └── +page.svelte       # /users/42 → matches (42 is an integer)
│   └── [username]/
│       └── +page.svelte       # /users/johndoe → matches (falls through)
```

Now `/users/42` routes to the ID-based page and `/users/johndoe` routes to the username-based page. Without the matcher, both URLs would match `[id]` because it appears first alphabetically.

Here are parameter matchers I use in every production project:

```typescript
// src/params/uuid.ts — match UUIDs
export const match: ParamMatcher = (param) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
};

// src/params/date.ts — match YYYY-MM-DD dates
export const match: ParamMatcher = (param) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(param) && !isNaN(Date.parse(param));
};

// src/params/locale.ts — match supported locales
const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'pt', 'ja'];
export const match: ParamMatcher = (param) => {
  return SUPPORTED_LOCALES.includes(param);
};
```

> **Pitfall:** Parameter matchers run on **every request** during route resolution. Keep them fast — simple regex tests or set lookups. Never make async calls, database queries, or anything that could slow down routing. A matcher that takes 50ms to run means 50ms added to every navigation in your app.

## Rest Parameters

Sometimes you need to capture an unknown number of URL segments. A documentation site might have pages nested like `/docs/getting-started`, `/docs/api/reference/load`, and `/docs/concepts/routing/advanced`. Rest parameters use the `[...name]` syntax to capture everything:

```bash
src/routes/docs/[...path]/
└── +page.svelte               # /docs/getting-started
                                # /docs/api/reference/load
                                # /docs/a/b/c/d
```

```svelte
<script lang="ts">
  import { page } from '$app/state';

  // /docs/api/reference/load → path = "api/reference/load"
  let path = $derived(page.params.path);
  let segments = $derived(path ? path.split('/') : []);
</script>

<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/docs">Docs</a></li>
    {#each segments as segment, i}
      <li>
        <a href="/docs/{segments.slice(0, i + 1).join('/')}">
          {segment}
        </a>
      </li>
    {/each}
  </ol>
</nav>

<p>You are viewing: {path}</p>
```

The captured value is a single string with `/` separators. Split it yourself to get the individual segments.

**Important:** A rest parameter also matches zero segments. `[...path]` matches `/docs` itself (with `path` as an empty string) as well as `/docs/anything/else`. Keep that in mind when designing your routes. If you need `/docs` to be handled differently from `/docs/something`, you might need both:

```bash
src/routes/docs/
├── +page.svelte              # /docs (the docs index page)
└── [...path]/
    └── +page.svelte          # /docs/anything/else
```

The static route (`/docs`) takes priority over the rest parameter because of SvelteKit's specificity rules.

### Rest Parameters for Catch-All 404 Pages

A common pattern is a catch-all route at the root level for custom 404 pages:

```bash
src/routes/[...catchall]/
└── +page.svelte
```

```typescript
// src/routes/[...catchall]/+page.ts
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  error(404, 'Page not found');
};
```

This catches any URL that does not match a more specific route and throws a 404, which your `+error.svelte` then renders. However, in most cases you do not need this — SvelteKit's built-in 404 handling works fine for routes that simply do not exist.

## Optional Parameters

Sometimes a URL segment is optional. Consider a site that supports multiple languages: `/en/about` and `/about` should both work. Use double brackets for optional parameters:

```bash
src/routes/[[lang]]/about/
└── +page.svelte               # /about (lang is undefined)
                                # /en/about (lang is "en")
                                # /fr/about (lang is "fr")
```

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let lang = $derived(page.params.lang ?? 'en');
</script>

<p>Language: {lang}</p>
```

Optional parameters solve a real design tension: you want clean URLs for the default case while still supporting explicit variants. Without this feature, you would need to duplicate routes or use awkward redirects.

### Combining Optional Parameters with Matchers

Optional parameters become powerful when combined with parameter matchers. You can ensure that the optional segment only matches valid locales:

```bash
src/routes/[[lang=locale]]/
├── +layout.svelte
├── +page.svelte               # / or /en or /fr
├── about/
│   └── +page.svelte           # /about or /en/about or /fr/about
└── blog/
    └── +page.svelte           # /blog or /en/blog or /fr/blog
```

```typescript
// src/params/locale.ts
import type { ParamMatcher } from '@sveltejs/kit';

const LOCALES = new Set(['en', 'es', 'fr', 'de', 'pt', 'ja']);

export const match: ParamMatcher = (param) => {
  return LOCALES.has(param);
};
```

Now `/en/about` matches (because `en` passes the locale matcher), but `/random/about` does not match the optional parameter and falls through to other routes. Without the matcher, `/random/about` would match with `lang = "random"`, which is probably not what you want.

> **Production war story:** I once shipped a multilingual site without a parameter matcher on the locale segment. The route was `[[lang]]/blog/[slug]`. A user shared a blog post URL and accidentally mangled it to `/blog/blog/my-post`. The router matched this with `lang = "blog"` and `slug = "my-post"`, which loaded the page with a broken locale. The fix was adding `=locale` to the parameter. Always validate your optional parameters.

## Route Groups

Route groups let you organize routes into logical sections without affecting their URLs. Wrap a folder name in parentheses:

```bash
src/routes/
├── (marketing)/
│   ├── +layout.svelte          # Marketing layout (big hero, flashy nav)
│   ├── +page.svelte            # / (home page)
│   ├── about/
│   │   └── +page.svelte        # /about
│   ├── pricing/
│   │   └── +page.svelte        # /pricing
│   └── blog/
│       ├── +page.svelte        # /blog
│       └── [slug]/
│           └── +page.svelte    # /blog/my-post
└── (app)/
    ├── +layout.svelte          # App layout (sidebar, top bar, compact)
    ├── dashboard/
    │   └── +page.svelte        # /dashboard
    ├── settings/
    │   ├── +page.svelte        # /settings
    │   ├── profile/
    │   │   └── +page.svelte    # /settings/profile
    │   └── billing/
    │       └── +page.svelte    # /settings/billing
    └── projects/
        ├── +page.svelte        # /projects
        └── [id]/
            └── +page.svelte    # /projects/abc123
```

The parenthesized folder names disappear from the URL. `/pricing` works as expected — but it uses the marketing layout (big hero images, flashy navigation), while `/dashboard` uses the app layout (sidebar, compact design). The URL structure is flat, but the code organization reflects the real logical sections of your application.

### Multiple Route Groups Sharing a URL Prefix

Route groups are particularly useful when different sections of your app need different layouts but share a URL prefix:

```bash
src/routes/
├── (auth)/
│   ├── +layout.svelte          # Minimal layout (centered card, no nav)
│   ├── login/
│   │   └── +page.svelte        # /login
│   ├── register/
│   │   └── +page.svelte        # /register
│   └── forgot-password/
│       └── +page.svelte        # /forgot-password
└── (protected)/
    ├── +layout.svelte          # Full app layout
    ├── +layout.server.ts       # Auth check — redirect if not logged in
    └── dashboard/
        └── +page.svelte        # /dashboard
```

```typescript
// src/routes/(protected)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  return { user: locals.user };
};
```

Now authentication checks happen at the layout level. Every route under `(protected)` inherits the auth guard without any extra code. Meanwhile, routes under `(auth)` use a minimal centered-card layout appropriate for login forms.

> **Naming convention:** Name your route groups by their purpose, not their layout. `(marketing)` and `(app)` are better than `(layout-a)` and `(layout-b)` because they convey intent. Six months from now, you will not remember what "layout-b" means.

### Breaking Out of Layouts

Sometimes a page under a route group needs a different layout than its siblings. Use `+page@.svelte` to "reset" to a specific layout level. The `@` followed by a segment name specifies which layout to use:

```bash
src/routes/
├── +layout.svelte              # Root layout
├── (app)/
│   ├── +layout.svelte          # App layout (sidebar)
│   ├── dashboard/
│   │   └── +page.svelte        # /dashboard — uses app layout
│   └── settings/
│       └── +page@.svelte       # /settings — uses ROOT layout (skips app layout)
```

The `+page@.svelte` (with nothing after `@`) means "use the root layout." You can also target specific groups: `+page@(app).svelte` would use the `(app)` group's layout. This is an escape hatch for the rare page that does not fit its group's layout.

## Route Priority Algorithm

When multiple routes could match the same URL, SvelteKit follows deterministic priority rules. Understanding these rules prevents routing surprises in production:

1. **More specific routes win over less specific ones.** A static segment beats a dynamic one. `/blog/featured` wins over `/blog/[slug]` for the URL `/blog/featured`.

2. **Dynamic parameters beat rest parameters.** `/blog/[slug]` wins over `/blog/[...path]`.

3. **Matchers add specificity.** `/users/[id=integer]` is tried before `/users/[username]`.

4. **Non-optional parameters beat optional ones.** `/[lang]/about` wins over `/[[lang]]/about` when both could match.

5. **Earlier routes take priority** if specificity is truly equal (alphabetical tie-breaking by folder name). This rarely matters in practice because most ambiguities are resolved by the above rules.

Here is a concrete example showing how routes resolve:

```bash
src/routes/
├── blog/
│   ├── +page.svelte                    # /blog
│   ├── featured/
│   │   └── +page.svelte                # /blog/featured (static)
│   ├── [slug=slug]/
│   │   └── +page.svelte                # /blog/my-post (dynamic with matcher)
│   ├── [id=integer]/
│   │   └── +page.svelte                # /blog/42 (dynamic with matcher)
│   └── [...path]/
│       └── +page.svelte                # /blog/a/b/c (rest)
```

Given these routes:
- `/blog` → matches `blog/+page.svelte` (exact match)
- `/blog/featured` → matches `blog/featured/+page.svelte` (static beats dynamic)
- `/blog/my-post` → matches `blog/[slug=slug]/+page.svelte` (passes slug matcher)
- `/blog/42` → tries `blog/[slug=slug]` first, but `42` may not pass the slug matcher → falls to `blog/[id=integer]`
- `/blog/MY-POST` → tries `blog/[slug=slug]`, but uppercase fails the slug matcher → falls to `blog/[...path]`
- `/blog/a/b/c` → matches `blog/[...path]` (no single-segment match fits)

> **Debugging tip:** If a route is not matching as you expect, check your parameter matchers. Add `console.log` inside the matcher temporarily to see what values are being tested. The most common bug is a matcher that is too strict or too loose.

## Real Example: A Multi-Section App Architecture

Let's put it all together with a realistic application structure — an e-commerce platform with public pages, authenticated user sections, and an admin panel:

```bash
src/routes/
├── +layout.svelte                       # Root layout (HTML head, global styles)
├── +layout.server.ts                    # Load session data for all routes
├── +error.svelte                        # Global error page
│
├── (public)/
│   ├── +layout.svelte                   # Public layout (header, footer, nav)
│   ├── +page.svelte                     # / (home page, hero, featured products)
│   ├── products/
│   │   ├── +page.svelte                 # /products (catalog listing)
│   │   ├── +page.server.ts              # Load products with filters/pagination
│   │   ├── ProductCard.svelte           # Co-located component
│   │   ├── FilterSidebar.svelte         # Co-located component
│   │   └── [slug]/
│   │       ├── +page.svelte             # /products/blue-widget
│   │       ├── +page.server.ts          # Load product detail + reviews
│   │       ├── ImageGallery.svelte      # Co-located component
│   │       └── ReviewList.svelte        # Co-located component
│   ├── blog/
│   │   ├── +page.svelte                 # /blog (post listing)
│   │   └── [slug=slug]/
│   │       └── +page.svelte             # /blog/my-first-post
│   ├── about/
│   │   └── +page.svelte                 # /about
│   └── contact/
│       └── +page.svelte                 # /contact
│
├── (auth)/
│   ├── +layout.svelte                   # Auth layout (centered card)
│   ├── login/
│   │   ├── +page.svelte                 # /login
│   │   └── +page.server.ts              # Login form action
│   ├── register/
│   │   ├── +page.svelte                 # /register
│   │   └── +page.server.ts              # Register form action
│   └── forgot-password/
│       └── +page.svelte                 # /forgot-password
│
├── (account)/
│   ├── +layout.svelte                   # Account layout (user sidebar)
│   ├── +layout.server.ts               # Auth guard — redirect to /login
│   ├── account/
│   │   └── +page.svelte                 # /account (user profile)
│   ├── orders/
│   │   ├── +page.svelte                 # /orders (order history)
│   │   └── [id=uuid]/
│   │       └── +page.svelte             # /orders/abc-123 (order detail)
│   └── wishlist/
│       └── +page.svelte                 # /wishlist
│
├── (admin)/
│   ├── +layout.svelte                   # Admin layout (admin sidebar, breadcrumbs)
│   ├── +layout.server.ts               # Admin role check
│   ├── admin/
│   │   ├── +page.svelte                 # /admin (admin dashboard)
│   │   ├── products/
│   │   │   ├── +page.svelte             # /admin/products (CRUD list)
│   │   │   └── [id=uuid]/
│   │   │       └── +page.svelte         # /admin/products/abc-123 (edit product)
│   │   └── users/
│   │       └── +page.svelte             # /admin/users
│
├── api/
│   ├── health/
│   │   └── +server.ts                   # GET /api/health
│   └── products/
│       ├── +server.ts                   # GET/POST /api/products
│       └── [id=uuid]/
│           └── +server.ts              # GET/PUT/DELETE /api/products/:id
│
└── [[lang=locale]]/
    └── legal/
        ├── terms/
        │   └── +page.svelte             # /legal/terms or /en/legal/terms
        └── privacy/
            └── +page.svelte             # /legal/privacy or /fr/legal/privacy
```

This architecture demonstrates:
- **Route groups** separating public, auth, user, and admin sections with different layouts and auth requirements
- **Parameter matchers** ensuring UUIDs and locales are validated at the routing level
- **Co-located components** next to the routes that use them
- **API endpoints** under `/api/` for programmatic access
- **Optional locale parameter** for legal pages that need multilingual support
- **Nested dynamic routes** for product catalogs, order details, and admin CRUD

## The Mental Model

Think of `src/routes/` as a tree. Each folder is a branch, each `+page.svelte` is a leaf. When a request arrives, SvelteKit walks the tree from the root, matching URL segments to folder names. Static names match literally. `[brackets]` match any single segment. `[...rest]` matches any remaining path. `((parens))` are invisible. `[[doubles]]` are optional.

Your file system _is_ your routing table. There is no abstraction layer between them. This has a profound implication: anyone can understand your app's URL structure by glancing at the directory tree. No indirection, no config files, no magic. The file system is the source of truth.

This design also means that refactoring URLs is refactoring files. Want to change `/blog` to `/articles`? Rename the folder. Your IDE's git diff shows exactly what URL changed. Code review for routing changes is just reviewing folder renames — no hunting through a router config for the right line. The simplicity is the feature.

Compare this with frameworks that use a central router file. In those systems, the route definition, the component, and the data loader can live in three separate places. In SvelteKit, they all live in the same folder. Everything you need to understand a route is right there: `+page.svelte`, `+page.server.ts`, `+layout.svelte`, all co-located. This co-location is not accidental — it is a deliberate design choice that makes routes easy to reason about, easy to move, and easy to delete.

### The "Delete Test"

Here is a useful litmus test for code organization: **how hard is it to delete a feature?** In a SvelteKit app with well-organized routes, deleting the blog feature means deleting the `src/routes/blog/` folder. That is it. One folder, gone. No orphaned route configs, no forgotten data loaders, no components sitting in a shared directory that nothing references anymore.

In a framework with a central router, deleting a feature means: removing the route config, finding and deleting the page component, finding and deleting the data loader, checking for references in other files, and hoping you did not miss anything. The file-based approach makes feature deletion trivially safe.

## Common Patterns and Pitfalls

### WRONG: Deeply nested route groups

```bash
# WRONG — unnecessary nesting makes routes hard to find
src/routes/
└── (main)/
    └── (content)/
        └── (pages)/
            └── about/
                └── +page.svelte
```

```bash
# CORRECT — route groups should be flat and purposeful
src/routes/
└── (marketing)/
    └── about/
        └── +page.svelte
```

### WRONG: Using route groups when a layout would suffice

```bash
# WRONG — if all routes share the same layout, you do not need a group
src/routes/
├── (everything)/
│   ├── +layout.svelte
│   ├── about/
│   │   └── +page.svelte
│   └── contact/
│       └── +page.svelte
```

```bash
# CORRECT — the root layout wraps everything by default
src/routes/
├── +layout.svelte
├── about/
│   └── +page.svelte
└── contact/
    └── +page.svelte
```

### WRONG: Conflicting dynamic routes without matchers

```bash
# WRONG — both routes match /users/anything, order is ambiguous
src/routes/users/
├── [id]/
│   └── +page.svelte
└── [username]/
    └── +page.svelte
```

```bash
# CORRECT — use matchers to disambiguate
src/routes/users/
├── [id=integer]/
│   └── +page.svelte
└── [username]/
    └── +page.svelte
```

### WRONG: Using rest parameters when you need a dynamic segment

```bash
# WRONG — [...slug] also matches /blog/category/svelte
src/routes/blog/
├── [...slug]/
│   └── +page.svelte
└── category/
    └── [name]/
        └── +page.svelte      # This will never match!
```

Rest parameters are greedy. They match everything, and because SvelteKit tries the more specific static `category/` path first, `/blog/category/svelte` routes correctly — but `/blog/my-post` matches `[...slug]` with `slug = "my-post"`, which is probably not what you want. Use `[slug]` for single-segment matches:

```bash
# CORRECT
src/routes/blog/
├── [slug]/
│   └── +page.svelte          # /blog/my-post
└── category/
    └── [name]/
        └── +page.svelte      # /blog/category/svelte
```

## Try It

1. Create a basic site with routes for `/`, `/about`, and `/projects`. Add a root layout with a navigation bar that links to all three pages.
2. Add a dynamic route at `/projects/[name]`. Create a `+page.server.ts` that returns mock project data based on the name. Visit `/projects/my-portfolio` and display the project name and description.
3. Add a parameter matcher for slugs (`src/params/slug.ts`) that only allows lowercase letters, numbers, and hyphens. Apply it to your blog route. Verify that `/blog/valid-slug` works but `/blog/INVALID` returns a 404.
4. Add a rest parameter route at `/docs/[...path]`. Visit `/docs/api/reference` and split the path into breadcrumb segments that render as a navigation trail.
5. Create an optional language parameter: `/[[lang=locale]]/about`. Create a locale matcher that accepts `en`, `es`, and `fr`. Confirm that `/about`, `/en/about`, and `/fr/about` all work, but `/zz/about` does not match.
6. Set up route groups: `(marketing)` with a flashy layout for `/` and `/about`, and `(app)` with a sidebar layout for `/dashboard` and `/settings`. Verify that the layouts switch when you navigate between sections.
7. Add a static route at `/blog/featured` alongside your `/blog/[slug]` route. Verify that `/blog/featured` hits the static route while `/blog/hello` hits the dynamic one.
8. Create an API endpoint at `/api/posts/+server.ts` that returns a JSON array of mock posts for GET requests and accepts new posts via POST.

## Key Takeaways

- Every `+page.svelte` inside `src/routes/` becomes a URL on your site — the folder structure _is_ the URL structure
- SvelteKit scans the filesystem at dev/build time and generates a route manifest that enables code splitting and client-side navigation
- The `+` prefix marks SvelteKit's special route files: `+page.svelte`, `+page.ts`, `+page.server.ts`, `+layout.svelte`, `+layout.ts`, `+layout.server.ts`, `+error.svelte`, and `+server.ts`
- `+page.svelte` is the visual component, `+page.server.ts` loads server-only data, `+page.ts` loads universal data
- `+layout.svelte` wraps pages with shared UI and is preserved across navigation — no unnecessary re-renders
- `+error.svelte` provides error boundaries that bubble up through the route tree
- `+server.ts` creates API endpoints that handle any HTTP method
- Dynamic routes use `[param]` syntax to capture variable URL segments as strings
- Parameter matchers (`[param=matcher]`) constrain what values a dynamic segment will accept — always use them to prevent ambiguous routing
- Rest parameters `[...rest]` capture an arbitrary number of remaining segments, including zero
- Optional parameters `[[param]]` match with or without the segment present — combine with matchers for safety
- Route groups `(name)` organize files and layouts without affecting URLs — use them to separate logical sections with different layouts and auth requirements
- Static routes always take priority over dynamic ones — SvelteKit resolves ambiguity by specificity
- Co-locate helper components alongside routes for code that is used by only one route; put shared components in `$lib/components/`
- No router configuration is needed — the file system is the router, and deleting a folder cleanly removes a feature
