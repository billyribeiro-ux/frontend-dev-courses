# Prerendered Content & Advanced Routing

TeamBoard is not only a dynamic app — it also has a marketing landing page, a help center, and documentation pages. These pages rarely change and do not depend on the logged-in user. Fetching them from a server on every request wastes resources. The `prerender()` remote function solves this by executing at build time and baking the results into static files that load instantly.

This lesson also covers the advanced routing features that support TeamBoard's URL structure: rest parameters for catch-all help pages, route matchers for validating team slugs, and optional parameters for locale-aware URLs. Together with prerendering, these patterns complete the routing layer you sketched in Module 44.

## The Mental Model: Build-Time vs Run-Time Data

Every piece of data in your application has a "freshness requirement." The question to ask is: **how often does this data change relative to deployments?**

```
Data Changes...               Use...
Never (after deploy)    →     prerender() with static inputs
Rarely (weekly/monthly) →     prerender() with dynamic: true
Per request (user-specific) → query() or load function
Per second (real-time)  →     WebSocket / Server-Sent Events
```

Marketing copy, help articles, and pricing pages change when a PM updates them — not when a user loads the page. These are deployment-time data. By running the data fetch once during `npm run build` instead of on every request, you eliminate server costs, reduce latency to zero (static file from CDN), and improve SEO (the HTML is already complete).

## Prerendering the Marketing Landing Page

TeamBoard's root page at `/` is a marketing landing page. It shows the app name, feature highlights, and a call-to-action. None of this content depends on user state. Use `prerender()` to fetch the content at build time:

```typescript
// src/lib/api/marketing.remote.ts
import { prerender } from '$app/server';

export const getLandingContent = prerender(async () => {
  // In production, this might fetch from a headless CMS
  return {
    headline: 'Ship projects faster, together',
    subheadline: 'TeamBoard is the real-time project manager built for modern teams.',
    features: [
      {
        title: 'Kanban Boards',
        description: 'Drag-and-drop task management with real-time sync across your team.'
      },
      {
        title: 'Live Collaboration',
        description: 'See changes as they happen. No refresh needed.'
      },
      {
        title: 'Team Permissions',
        description: 'Owner, admin, member, and viewer roles keep your projects secure.'
      }
    ],
    ctaText: 'Get Started Free'
  };
});
```

Use it in the landing page component:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { getLandingContent } from '$lib/api/marketing.remote';
  import { PUBLIC_APP_NAME } from '$env/static/public';

  const content = getLandingContent();
</script>

<svelte:head>
  <title>{PUBLIC_APP_NAME} — Project Management for Teams</title>
</svelte:head>

{#await content then landing}
  <div class="min-h-screen">
    <!-- Hero -->
    <section class="py-24 px-8 text-center max-w-4xl mx-auto">
      <h1 class="text-5xl font-bold tracking-tight">{landing.headline}</h1>
      <p class="text-xl text-gray-600 mt-4">{landing.subheadline}</p>
      <a
        href="/signup"
        class="inline-block mt-8 px-8 py-3 bg-indigo-600 text-white rounded-lg
               text-lg font-medium hover:bg-indigo-700 transition-colors"
      >
        {landing.ctaText}
      </a>
    </section>

    <!-- Features -->
    <section class="py-16 px-8 bg-gray-50 dark:bg-gray-900">
      <div class="max-w-5xl mx-auto grid gap-8 md:grid-cols-3">
        {#each landing.features as feature}
          <div class="p-6 bg-white dark:bg-gray-800 rounded-lg">
            <h3 class="text-lg font-semibold">{feature.title}</h3>
            <p class="text-gray-600 dark:text-gray-400 mt-2">{feature.description}</p>
          </div>
        {/each}
      </div>
    </section>
  </div>
{/await}
```

At build time, `getLandingContent` executes once. The result is embedded in the built output. Every visitor receives the cached data instantly — no server call at runtime.

## Combining prerender() with the Page Option

For the marketing page, you also want to set the `prerender` page option so SvelteKit generates a static HTML file for the entire route:

```typescript
// src/routes/+page.ts
export const prerender = true;
```

### WRONG vs CORRECT: When to Set prerender = true

```typescript
// WRONG — prerendering a page that depends on the logged-in user
// src/routes/dashboard/+page.ts
export const prerender = true;
// The dashboard shows different content for each user.
// A prerendered page is the same for everyone — user-specific data is missing.

// WRONG — prerendering a page with dynamic form actions
// src/routes/contact/+page.ts
export const prerender = true;
// Form actions require a server. Prerendered pages have no server at runtime.

// CORRECT — prerendering a page with static content
// src/routes/pricing/+page.ts
export const prerender = true;
// Pricing is the same for every visitor. No user-specific data.
```

The page option `export const prerender = true` tells SvelteKit to render the entire route to static HTML at build time. The `prerender()` function bakes specific data into the build. Together, the page is fully static — no server at runtime. Use this on any page where the content does not change per request:

```typescript
// src/routes/pricing/+page.ts
export const prerender = true;

// src/routes/about/+page.ts
export const prerender = true;

// src/routes/terms/+page.ts
export const prerender = true;
```

## Prerendering Multiple Help Pages with inputs

TeamBoard has a help center with multiple articles. Each article has a slug, and you know the full list at build time. Use `prerender()` with the `inputs` option to generate all of them:

```typescript
// src/lib/api/help.remote.ts
import { prerender } from '$app/server';
import * as v from 'valibot';

const helpArticles = {
  'getting-started': {
    title: 'Getting Started with TeamBoard',
    body: 'Welcome to TeamBoard! This guide walks you through creating your first team, setting up a board, and inviting your teammates...',
    category: 'basics'
  },
  'creating-boards': {
    title: 'Creating and Managing Boards',
    body: 'Boards are the heart of TeamBoard. Each board represents a project or workflow. To create a board, navigate to your team page and click "New Board"...',
    category: 'basics'
  },
  'keyboard-shortcuts': {
    title: 'Keyboard Shortcuts',
    body: 'TeamBoard supports keyboard shortcuts for power users. Press Cmd+K (or Ctrl+K) to open the command palette. Use arrow keys to navigate tasks...',
    category: 'productivity'
  },
  'team-roles': {
    title: 'Understanding Team Roles',
    body: 'TeamBoard has four roles: Owner, Admin, Member, and Viewer. Owners can delete the team and manage billing. Admins can invite members and change settings...',
    category: 'teams'
  },
  'integrations': {
    title: 'Integrations and Webhooks',
    body: 'Connect TeamBoard to your existing tools using webhooks. Go to Team Settings > Integrations to configure outgoing webhooks for task events...',
    category: 'advanced'
  }
};

export const getHelpArticle = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const article = helpArticles[slug as keyof typeof helpArticles];
    if (!article) {
      throw new Error(`Help article not found: ${slug}`);
    }
    return article;
  },
  {
    inputs: Object.keys(helpArticles).map((slug) => ({ slug }))
  }
);

export const getHelpIndex = prerender(async () => {
  return Object.entries(helpArticles).map(([slug, article]) => ({
    slug,
    title: article.title,
    category: article.category
  }));
});
```

At build time, SvelteKit calls `getHelpArticle` five times — once per slug in `inputs`. All results are cached. `getHelpIndex` runs once and returns the article list.

### How inputs Works Under the Hood

```
Build time:
  getHelpArticle({ slug: 'getting-started' }) → result cached
  getHelpArticle({ slug: 'creating-boards' }) → result cached
  getHelpArticle({ slug: 'keyboard-shortcuts' }) → result cached
  getHelpArticle({ slug: 'team-roles' }) → result cached
  getHelpArticle({ slug: 'integrations' }) → result cached

Runtime:
  Request for /help/getting-started → serve cached result (no server call)
  Request for /help/unknown-slug → ???
```

Without `dynamic: true`, a request for a slug not in `inputs` fails. With `dynamic: true`, it falls back to a live server call.

The help index page:

```svelte
<!-- src/routes/(app)/help/+page.svelte -->
<script lang="ts">
  import { getHelpIndex } from '$lib/api/help.remote';

  const articles = getHelpIndex();
</script>

<svelte:head>
  <title>Help Center — TeamBoard</title>
</svelte:head>

<div class="p-8 max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">Help Center</h1>

  {#await articles then list}
    <div class="space-y-3">
      {#each list as article}
        <a
          href="/help/{article.slug}"
          class="block p-4 border rounded-lg hover:border-indigo-300 transition-colors"
        >
          <h2 class="font-medium">{article.title}</h2>
          <span class="text-xs text-gray-500 uppercase">{article.category}</span>
        </a>
      {/each}
    </div>
  {/await}
</div>
```

Every link loads instantly because the data is already baked into the build.

## Dynamic Fallback for New Content

What happens when you add a new help article after the build? Without `dynamic: true`, the request fails because the slug was not in the `inputs` array. Enable the fallback:

```typescript
// src/lib/api/help.remote.ts (updated)
export const getHelpArticle = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    // In production, fetch from a CMS or database
    const res = await fetch(`https://cms.teamboard.dev/api/help/${slug}`);

    if (!res.ok) {
      throw new Error(`Help article not found: ${slug}`);
    }

    return res.json();
  },
  {
    inputs: [
      { slug: 'getting-started' },
      { slug: 'creating-boards' },
      { slug: 'keyboard-shortcuts' },
      { slug: 'team-roles' },
      { slug: 'integrations' }
    ],
    dynamic: true
  }
);
```

Known articles are served from the build cache. A request for `/help/new-feature-guide` triggers a live server call. The result is cached via the Cache API and cleared on the next deployment.

### The Cache Lifecycle with dynamic: true

```
Deploy v1:
  Build: prerender 5 known articles → cached
  Runtime: /help/getting-started → from build cache (instant)
  Runtime: /help/new-article → live server call → runtime cache

Deploy v2:
  Build: prerender 5 known articles (possibly including new-article) → cached
  Runtime cache from v1 is cleared
  Everything starts fresh from the new build
```

This means `dynamic: true` articles have slightly higher latency on first request (live server call) but are instant on subsequent requests until the next deploy. If you know a new article will be popular, add it to `inputs` for the next build.

## Rest Parameters: Catch-All Help Routes

TeamBoard's help center supports nested paths like `/help/getting-started`, `/help/teams/roles`, and `/help/advanced/integrations/webhooks`. A rest parameter captures all segments after `/help/`:

```
src/routes/(app)/help/[...slug]/
  +page.svelte
```

The `[...slug]` parameter matches any number of path segments:

| URL | `params.slug` |
|-----|---------------|
| `/help/getting-started` | `'getting-started'` |
| `/help/teams/roles` | `'teams/roles'` |
| `/help/advanced/integrations/webhooks` | `'advanced/integrations/webhooks'` |

### WRONG vs CORRECT: Handling Rest Parameters

```typescript
// WRONG — assuming slug is a single segment
export const load: PageLoad = async ({ params }) => {
  const article = await getArticle(params.slug);
  // params.slug is 'teams/roles' — not just 'roles'
  // Your lookup may fail if it expects a single word
};

// CORRECT — handle the full path, including nested segments
export const load: PageLoad = async ({ params }) => {
  // Split for breadcrumb generation
  const segments = params.slug.split('/');
  const article = await getArticle(params.slug);

  return {
    article,
    breadcrumbs: segments.map((seg, i) => ({
      label: seg.replace(/-/g, ' '),
      href: `/help/${segments.slice(0, i + 1).join('/')}`
    }))
  };
};
```

Build the help article page:

```svelte
<!-- src/routes/(app)/help/[...slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { getHelpArticle } from '$lib/api/help.remote';

  const article = getHelpArticle({ slug: page.params.slug });
</script>

{#await article}
  <div class="p-8">
    <div class="h-8 w-64 bg-gray-100 rounded animate-pulse mb-4"></div>
    <div class="h-4 w-full bg-gray-100 rounded animate-pulse mb-2"></div>
    <div class="h-4 w-3/4 bg-gray-100 rounded animate-pulse"></div>
  </div>
{:then content}
  <article class="p-8 max-w-3xl mx-auto">
    <nav class="text-sm text-gray-500 mb-4">
      <a href="/help" class="hover:text-indigo-600">Help Center</a>
      <span class="mx-2">/</span>
      <span>{content.title}</span>
    </nav>

    <h1 class="text-3xl font-bold mb-4">{content.title}</h1>
    <span class="inline-block px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded mb-6">
      {content.category}
    </span>

    <div class="prose dark:prose-invert">
      {content.body}
    </div>
  </article>
{:catch err}
  <div class="p-8 text-center">
    <h1 class="text-2xl font-bold mb-2">Article Not Found</h1>
    <p class="text-gray-600">{err.message}</p>
    <a href="/help" class="text-indigo-600 hover:underline mt-4 inline-block">
      Back to Help Center
    </a>
  </div>
{/await}
```

A single route file handles any depth of help URL. Without rest parameters, you would need nested `[slug]` folders for each level.

## Route Matchers: Validating Team Slugs

TeamBoard uses team slugs in URLs: `/acme-corp/boards`, `/design-team/settings`. The `[teamSlug]` parameter in the route tree should only match valid slugs — lowercase letters, numbers, and hyphens. A route matcher enforces this:

```typescript
// src/params/teamSlug.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  // Valid team slugs: lowercase letters, numbers, and hyphens
  // Must start with a letter, 3-40 characters
  return /^[a-z][a-z0-9-]{2,39}$/.test(param);
};
```

Apply the matcher to the route parameter by adding `=matcherName` after the parameter name:

```
src/routes/(app)/[teamSlug=teamSlug]/
  +layout.svelte
  +layout.server.ts
  boards/
    +page.svelte
  settings/
    +page.svelte
  activity/
    +page.svelte
```

Now `/ACME-Corp/boards` (uppercase) or `/a/boards` (too short) return a 404 without reaching any load function.

### Why Route Matchers Matter for Security and Performance

Without a matcher, every URL segment hits your load function, which queries the database. A bot scanning `/admin/boards`, `/wp-admin/boards`, `/../../etc/passwd/boards` triggers database queries for nonsensical slugs. A matcher rejects these at the routing layer — no load function runs, no database query fires.

```typescript
// Without matcher: /🎉/boards hits the database
// slug '🎉' passes to the load function, queries the DB, returns 404

// With matcher: /🎉/boards is rejected immediately
// match('🎉') returns false, SvelteKit returns 404 without running any load
```

You can create matchers for other parameters too:

```typescript
// src/params/boardId.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  // Board IDs must be positive integers
  return /^\d+$/.test(param) && parseInt(param) > 0;
};
```

```
src/routes/(app)/[teamSlug=teamSlug]/boards/[boardId=boardId]/
  +page.svelte
```

Now `/acme-corp/boards/42` matches, but `/acme-corp/boards/abc` returns a 404.

## Optional Parameters: Locale-Aware Help Pages

In Module 44 you built a `reroute` hook that strips locale prefixes from URLs. Optional parameters let you define routes that work with or without a locale segment:

```
src/routes/[[lang]]/help/
  +page.svelte
src/routes/[[lang]]/help/[...slug]/
  +page.svelte
```

The double brackets `[[lang]]` make the parameter optional. All of these URLs resolve to the same route:

| URL | `params.lang` |
|-----|---------------|
| `/help` | `undefined` |
| `/en/help` | `'en'` |
| `/es/help` | `'es'` |
| `/help/getting-started` | `undefined` |
| `/fr/help/getting-started` | `'fr'` |

Combine it with a route matcher to restrict valid locales:

```typescript
// src/params/lang.ts
import type { ParamMatcher } from '@sveltejs/kit';

const supportedLocales = ['en', 'es', 'fr', 'pt'];

export const match: ParamMatcher = (param) => {
  return supportedLocales.includes(param);
};
```

```
src/routes/[[lang=lang]]/help/[...slug]/
  +page.svelte
```

Now `/en/help/getting-started` matches but `/xyz/help/getting-started` does not.

### WRONG vs CORRECT: Optional Parameter Ambiguity

```
WRONG — optional parameter before a non-optional segment with the same name
src/routes/[[lang]]/[[category]]/+page.svelte
  /en → params.lang = 'en', params.category = undefined
  /news → params.lang = 'news', params.category = undefined
  // Is "news" a language or a category? SvelteKit cannot tell.

CORRECT — use matchers to disambiguate
src/routes/[[lang=lang]]/[[category=category]]/+page.svelte
  /en → lang matcher matches 'en', category = undefined
  /news → lang matcher rejects 'news', falls through to category
```

When optional parameters are ambiguous, matchers resolve the ambiguity by testing each parameter against its validation function.

Use the optional parameter to determine the display language:

```svelte
<!-- src/routes/[[lang=lang]]/help/[...slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { getHelpArticle } from '$lib/api/help.remote';

  // Default to 'en' if no locale in URL
  const locale = page.params.lang ?? 'en';
  const article = getHelpArticle({ slug: page.params.slug });
</script>

{#await article then content}
  <article class="p-8 max-w-3xl mx-auto" lang={locale}>
    <h1 class="text-3xl font-bold mb-4">{content.title}</h1>
    <div class="prose dark:prose-invert">
      {content.body}
    </div>
  </article>
{/await}
```

## Decision Guide: prerender() vs query() vs Load Functions

| Approach | When to Use | Example |
|----------|-------------|---------|
| `prerender()` | Data known at build time, changes rarely | Marketing pages, help articles, site config, navigation menus |
| `prerender()` with `dynamic: true` | Mostly static data with occasional new additions | Help articles added via CMS after deployment |
| `query()` | Dynamic data that changes per request or per user | Team lists, project boards, task data, search results |
| `+page.server.ts` load | Route-level data tied to URL params, auth guards | Team slug resolution, layout-level auth checks |
| `+page.ts` load (universal) | Data fetched on both server and client | Data from public APIs that do not need secrets |

The key question is: **when does this data change?** Never — `prerender()`. Rarely — `prerender()` with `dynamic: true`. Per request — `query()`. Per route — `+page.server.ts`. You can combine them: TeamBoard uses `+layout.server.ts` for auth guards, `query()` for boards and tasks, and `prerender()` for marketing content.

### The Cost Comparison

| Approach | Build Time Cost | Runtime Cost | CDN-Friendly |
|----------|----------------|-------------|--------------|
| `prerender()` | One fetch per input | Zero | Yes — static file |
| `prerender()` + `dynamic: true` | One per known input | One fetch per unknown input | Partially |
| `query()` | None | One fetch per request | Depends on caching |
| `+page.server.ts` | None | One DB query per request | No |

For marketing pages with millions of visitors, `prerender()` saves millions of server calls. For a board page with 10 daily users, the cost difference is negligible.

## Putting It All Together: TeamBoard's Route Map

Here is how the routing features from this lesson fit into TeamBoard's route structure:

```
src/
├── params/
│   ├── teamSlug.ts          ← Route matcher: lowercase, hyphens, 3-40 chars
│   ├── boardId.ts           ← Route matcher: positive integers only
│   └── lang.ts              ← Route matcher: supported locales only
├── routes/
│   ├── +page.svelte         ← Marketing landing (prerendered)
│   ├── +page.ts             ← export const prerender = true
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (app)/
│   │   ├── dashboard/
│   │   │   └── +page.svelte              ← Uses query(getTeams)
│   │   ├── [teamSlug=teamSlug]/
│   │   │   ├── +layout.server.ts         ← Resolves slug → team
│   │   │   ├── boards/
│   │   │   │   ├── +page.svelte          ← Uses query(getProjects)
│   │   │   │   └── [boardId=boardId]/
│   │   │   │       └── +page.svelte      ← Uses query(getTasksByBoard)
│   │   │   ├── settings/
│   │   │   └── activity/
│   │   └── [[lang=lang]]/
│   │       └── help/
│   │           ├── +page.svelte           ← Uses prerender(getHelpIndex)
│   │           └── [...slug]/
│   │               └── +page.svelte       ← Uses prerender(getHelpArticle)
│   ├── pricing/
│   │   ├── +page.svelte
│   │   └── +page.ts                      ← export const prerender = true
│   └── about/
│       ├── +page.svelte
│       └── +page.ts                      ← export const prerender = true
```

Each route uses the data loading strategy that fits its content:

- **Marketing, pricing, about** — fully prerendered, no server at runtime
- **Help center** — prerendered with `dynamic: true` for new CMS articles
- **Dashboard, boards, tasks** — `query()` for real-time data
- **Team layout** — `+layout.server.ts` for slug resolution and auth
- **Team URLs** — `teamSlug` matcher prevents invalid slugs from reaching the database
- **Board URLs** — `boardId` matcher ensures only positive integers match
- **Help URLs** — `[...slug]` rest parameter captures any depth of nested paths
- **Locale URLs** — `[[lang=lang]]` optional parameter with matcher for supported locales

## Try It

Build the prerendering and routing layer for TeamBoard:

1. Create a `prerender()` function for help articles with `inputs` for at least three known slugs and `dynamic: true` for new content. Add a `getHelpIndex()` function that returns all article summaries.
2. Create a `src/params/teamSlug.ts` route matcher that validates slugs (lowercase, hyphens, 3-40 characters). Test it by navigating to `/INVALID/boards` and verifying a 404.
3. Create a `src/params/boardId.ts` route matcher that validates positive integers. Test with `/acme/boards/abc` (404) and `/acme/boards/42` (match).
4. Set up the catch-all help route at `src/routes/(app)/help/[...slug]/+page.svelte` using the rest parameter. Build a breadcrumb component that splits `params.slug` into segments.
5. Add `export const prerender = true` to the marketing landing page and pricing page. Run `npm run build` and verify the output contains static HTML files.
6. Create an optional `[[lang=lang]]` parameter for the help section with a `lang.ts` matcher. Test that `/en/help/getting-started`, `/help/getting-started`, and `/fr/help/getting-started` all resolve correctly.
7. Verify that `/help/getting-started` loads from the build cache (check network tab — no API request), `/help/new-article` falls back to a server call (if `dynamic: true`), and `/INVALID-TEAM/boards` returns a 404 immediately (no database query).
8. Create a sitemap of all prerendered pages by reading the `inputs` array and generating URLs.

## Key Takeaways

- `prerender()` executes at build time and serves cached results with zero runtime cost — ideal for marketing pages and help content
- Use `inputs` to prerender multiple argument combinations (one per help article, one per known slug)
- `dynamic: true` falls back to a live server call for values not in the prerendered set, then caches the result until the next deployment
- `export const prerender = true` makes an entire route fully static — combine with `prerender()` for maximum performance
- Rest parameters `[...slug]` capture any number of path segments — perfect for catch-all documentation and help routes
- Route matchers (`src/params/teamSlug.ts`) validate URL parameters before they reach load functions, preventing invalid data from hitting your database and blocking bot scanning
- Optional parameters `[[lang]]` let a route segment be present or absent — useful for locale prefixes
- Combine optional parameters with route matchers (`[[lang=lang]]`) to restrict valid values and resolve ambiguity
- Use `$app/state` (not `$app/stores`) for accessing `page.params` in components
- Choose `prerender()` for build-time data, `query()` for runtime data, and `+page.server.ts` for route-level setup
- The `reroute` hook and optional parameters work together: the hook normalizes URLs, the parameter captures the value
- Route matchers prevent unnecessary database queries from bot traffic and invalid URLs — a security and performance win
