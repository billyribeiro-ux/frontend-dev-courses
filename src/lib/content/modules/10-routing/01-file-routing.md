# File-Based Routing

SvelteKit's routing system is built on a powerful idea: **your file system is your router configuration**. The files and folders you create inside `src/routes/` automatically become pages on your website. There is no router configuration file to maintain, no route registration, and no wiring. If the file exists, the route exists.

This is not a convenience shortcut layered on top of a "real" router. The file system _is_ the router. Every time you create, rename, or delete a file in `src/routes/`, you are directly modifying your application's routing table. This makes your project structure a living, browsable map of every URL your application can serve.

Want to know what pages your app has? Run `ls -R src/routes/` and you have your answer.

## The +page.svelte Convention

The file `src/routes/+page.svelte` is your home page. It maps to the root URL `/`:

```svelte
<!-- src/routes/+page.svelte → localhost:5173/ -->
<h1>Welcome to My Site</h1>
<p>This is the home page.</p>
```

The `+` prefix is critical. It tells SvelteKit "this is a route file, not a regular component." You can have other `.svelte` files in your route directories (helper components, for example), but only files starting with `+` have special routing meaning. This convention keeps the boundary clear: `+page.svelte` is a route, `Header.svelte` is just a component.

SvelteKit recognizes several `+` files: `+page.svelte`, `+page.ts`, `+page.server.ts`, `+layout.svelte`, `+layout.server.ts`, `+error.svelte`, and `+server.ts`. Each plays a different role in the routing system. For now, we focus on `+page.svelte` — the file that defines what a user sees when they visit a URL.

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

You can also place regular Svelte components alongside route files. A file like `src/routes/blog/PostCard.svelte` is just a component — it will not become a route because it does not start with `+`. This lets you co-locate helper components with the routes that use them, keeping related code together.

## Dynamic Routes

Static routes only get you so far. What about `/blog/my-first-post` or `/users/42`? You cannot create a folder for every possible blog post. This is where **dynamic parameters** come in — wrap a folder name in square brackets to capture a variable segment:

```bash
src/routes/blog/[slug]/
└── +page.svelte               # /blog/anything-here
```

Inside the component, access the dynamic value through the `page` object from `$app/state` (the modern Svelte 5 API) or the `$page` store from `$app/stores`:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  // If the URL is /blog/my-first-post, slug = "my-first-post"
  let slug = $derived(page.params.slug);
</script>

<h1>Blog Post: {slug}</h1>
```

Dynamic parameters always arrive as strings. If your route is `/products/[id]` and the user visits `/products/42`, `page.params.id` is the string `"42"`, not the number `42`. Parse it yourself if you need a number. Better yet, validate it in a `load` function where you can throw a 404 for invalid values.

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

### Type Safety with Parameter Matchers

By default, a dynamic parameter matches any string. The route `/blog/[slug]` will match `/blog/hello`, `/blog/123`, even `/blog/---`. You can constrain this with **parameter matchers**. Create a file in `src/params/`:

```typescript
// src/params/slug.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^[a-z0-9-]+$/.test(param);
};
```

Then reference the matcher in your route folder name:

```bash
src/routes/blog/[slug=slug]/
└── +page.svelte               # Only matches lowercase alphanumeric slugs
```

If a URL does not match, SvelteKit skips that route and tries others. This is how you build robust, predictable routing.

## Rest Parameters

Sometimes you need to capture an unknown number of URL segments. A blog might have posts nested under date paths like `/blog/2025/06/my-post`. Rest parameters use the `[...name]` syntax to capture everything:

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
  let segments = $derived(path.split('/'));
</script>

<p>You are viewing: {path}</p>
<p>Segments: {segments.length}</p>
```

The captured value is a single string with `/` separators. Split it yourself to get the individual segments.

Rest parameters are commonly used for documentation sites, catch-all 404 pages, and CMS-driven routes where the depth of nesting is unknown at build time.

**Important:** A rest parameter also matches zero segments. `[...path]` matches `/docs` itself (with `path` as an empty string) as well as `/docs/anything/else`. Keep that in mind when designing your routes.

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

## Route Groups

Route groups let you organize routes into logical sections without affecting their URLs. Wrap a folder name in parentheses:

```bash
src/routes/
├── (marketing)/
│   ├── +layout.svelte          # Marketing layout
│   ├── +page.svelte            # / (home page)
│   ├── about/
│   │   └── +page.svelte        # /about
│   └── pricing/
│       └── +page.svelte        # /pricing
└── (app)/
    ├── +layout.svelte          # App layout (dashboard UI)
    ├── dashboard/
    │   └── +page.svelte        # /dashboard
    └── settings/
        └── +page.svelte        # /settings
```

The parenthesized folder names disappear from the URL. `/pricing` works as expected — but it uses the marketing layout, while `/dashboard` uses the app layout. This is primarily a layout organization tool, and we will cover it more deeply in the Layouts lesson.

## Route Priority

When multiple routes could match the same URL, SvelteKit follows deterministic priority rules:

1. **More specific routes win over less specific ones.** A static segment beats a dynamic one. `/blog/featured` wins over `/blog/[slug]` for the URL `/blog/featured`.
2. **Dynamic parameters beat rest parameters.** `/blog/[slug]` wins over `/blog/[...path]`.
3. **Non-optional parameters beat optional ones.** `/[lang]/about` wins over `/[[lang]]/about` when both could match.
4. **Earlier-defined parameters take priority** if specificity is equal (alphabetical tie-breaking by folder name).

This ordering means you can safely create both `/blog/featured` and `/blog/[slug]` — SvelteKit will route to the static page when the URL is exactly `/blog/featured` and fall through to the dynamic route for everything else. No ambiguity, no surprises.

## Real Example: A Blog

Let's put it all together with a realistic blog structure:

```bash
src/routes/
├── +page.svelte                     # / (home)
└── blog/
    ├── +page.svelte                 # /blog (post listing)
    ├── [slug]/
    │   └── +page.svelte             # /blog/my-first-post
    └── category/
        └── [category]/
            └── +page.svelte         # /blog/category/svelte
```

```svelte
<!-- src/routes/blog/+page.svelte -->
<h1>All Blog Posts</h1>
<!-- List all posts here -->
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  let slug = $derived(page.params.slug);
</script>

<article>
  <h1>Reading: {slug}</h1>
  <!-- Post content loaded from +page.server.ts -->
</article>
```

```svelte
<!-- src/routes/blog/category/[category]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  let category = $derived(page.params.category);
</script>

<h1>Posts in "{category}"</h1>
<!-- Filtered post list -->
```

Notice that `/blog/category/svelte` and `/blog/[slug]` do not conflict. SvelteKit tries the static `category/` segment first because it is more specific than the dynamic `[slug]`. The URL `/blog/category` would be caught by `[slug]` (with slug = "category") since there is no `+page.svelte` directly inside `blog/category/`. Design your routes with this specificity model in mind.

## The Mental Model

Think of `src/routes/` as a tree. Each folder is a branch, each `+page.svelte` is a leaf. When a request arrives, SvelteKit walks the tree from the root, matching URL segments to folder names. Static names match literally. `[brackets]` match any single segment. `[...rest]` matches any remaining path. `((parens))` are invisible. `[[doubles]]` are optional.

Your file system _is_ your routing table. There is no abstraction layer between them. This has a profound implication: anyone can understand your app's URL structure by glancing at the directory tree. No indirection, no config files, no magic. The file system is the source of truth.

This design also means that refactoring URLs is refactoring files. Want to change `/blog` to `/articles`? Rename the folder. Your IDE's git diff shows exactly what URL changed. Code review for routing changes is just reviewing folder renames — no hunting through a router config for the right line. The simplicity is the feature.

Compare this with frameworks that use a central router file. In those systems, the route definition, the component, and the data loader can live in three separate places. In SvelteKit, they all live in the same folder. Everything you need to understand a route is right there: `+page.svelte`, `+page.server.ts`, `+layout.svelte`, all co-located. This co-location is not accidental — it is a deliberate design choice that makes routes easy to reason about, easy to move, and easy to delete.

## Try It

1. Create a basic site with routes for `/`, `/about`, and `/projects`.
2. Add a dynamic route at `/projects/[name]`. Visit `/projects/my-portfolio` and display the project name.
3. Add a rest parameter route at `/docs/[...path]`. Visit `/docs/api/reference` and split the path into breadcrumb segments.
4. Create an optional language parameter: `/[[lang]]/about`. Confirm that both `/about` and `/en/about` render the same page with the correct language value.
5. Add a static route at `/blog/featured` alongside your `/blog/[slug]` route. Verify that `/blog/featured` hits the static route while `/blog/hello` hits the dynamic one.

## Key Takeaways

- Every `+page.svelte` inside `src/routes/` becomes a URL on your site — the folder structure _is_ the URL structure
- The `+` prefix marks SvelteKit's special route files (`+page.svelte`, `+page.server.ts`, `+layout.svelte`, etc.)
- Dynamic routes use `[param]` syntax to capture variable URL segments as strings
- Rest parameters `[...rest]` capture an arbitrary number of remaining segments
- Optional parameters `[[param]]` match with or without the segment present
- Route groups `(name)` organize files and layouts without affecting URLs
- Parameter matchers constrain what values a dynamic segment will accept
- Static routes always take priority over dynamic ones — SvelteKit resolves ambiguity by specificity
- No router configuration is needed — the file system is the router
