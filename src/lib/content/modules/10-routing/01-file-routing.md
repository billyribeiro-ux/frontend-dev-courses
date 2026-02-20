# File-Based Routing

SvelteKit's routing system is one of its best features: the files and folders you create inside `src/routes/` automatically become pages on your website. There is no router configuration file to maintain, no route registration, and no wiring. If the file exists, the route exists.

This approach is called **file-based routing**, and it makes your project structure a direct map of your site's URL structure. Want to know what pages your app has? Just look at the `src/routes/` folder.

## The Home Page

The file `src/routes/+page.svelte` is your home page. It maps to the root URL `/`:

```svelte
<!-- src/routes/+page.svelte → localhost:5173/ -->
<h1>Welcome to My Site</h1>
<p>This is the home page.</p>
```

Every route needs a `+page.svelte` file. The `+` prefix tells SvelteKit this is a special route file, not a regular component.

## Creating New Routes

To add a new page, create a folder with a `+page.svelte` file inside it:

```bash
src/routes/
├── +page.svelte               # /
├── about/
│   └── +page.svelte           # /about
├── contact/
│   └── +page.svelte           # /contact
└── blog/
    └── +page.svelte           # /blog
```

```svelte
<!-- src/routes/about/+page.svelte -->
<h1>About Us</h1>
<p>We build things with SvelteKit.</p>
```

## Dynamic Routes

What if you need a route that changes — like `/blog/my-first-post` or `/blog/svelte-is-great`? Use **dynamic parameters** by wrapping a folder name in square brackets:

```bash
src/routes/blog/[slug]/
└── +page.svelte               # /blog/anything-here
```

Inside the component, access the dynamic value using the `$page` store:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  // If the URL is /blog/my-first-post, slug = "my-first-post"
  const slug = $page.params.slug;
</script>

<h1>Blog Post: {slug}</h1>
```

You can have multiple dynamic segments too:

```bash
src/routes/products/[category]/[id]/
└── +page.svelte               # /products/shoes/42
```

## The $page Store

The `$page` store gives you information about the current page. Import it from `$app/stores`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
</script>

<p>Current URL: {$page.url.pathname}</p>
<p>Route params: {JSON.stringify($page.params)}</p>
```

This is useful for highlighting active navigation links, reading query parameters, and accessing route data.

## Try It

Create three routes in your project: `/about`, `/projects`, and `/projects/[name]`. In the dynamic route, display the project name from the URL parameters. Visit `/projects/my-portfolio` in your browser and confirm the name appears on the page.

## Key Takeaways

- Every `+page.svelte` inside `src/routes/` becomes a URL on your site
- Folder structure directly maps to URL structure
- Dynamic routes use `[paramName]` bracket syntax in folder names
- Access URL parameters with the `$page` store from `$app/stores`
- The `+` prefix marks SvelteKit's special route files
- No router configuration is needed — the file system is the router
