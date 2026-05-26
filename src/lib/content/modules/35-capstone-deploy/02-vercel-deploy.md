# Deploying to Vercel

Your store is built, tested, and ready. In this lesson you will deploy it to Vercel — connect your repository, configure environment variables, set up the SvelteKit adapter, deploy, and connect a custom domain. But we will go far beyond the basics: edge vs serverless runtime decisions, ISR (Incremental Static Regeneration), preview deployments for every pull request, monitoring and logging, rollback strategies, and a comparison of alternative platforms so you can make an informed choice.

By the end of this lesson, your store will be live on the internet with a production-grade deployment pipeline.

## Why Vercel for SvelteKit

Vercel is an excellent fit for SvelteKit because it was designed for the same architectural model: static assets on a CDN, dynamic routes as serverless functions, and edge middleware for fast request processing. Every SvelteKit concept maps cleanly to a Vercel primitive:

```
SvelteKit Concept          → Vercel Primitive
────────────────           ─────────────────
Prerendered pages          → Static files on CDN edge
Server load functions      → Serverless functions (or Edge Functions)
Form actions               → Serverless functions
API routes (+server.ts)    → Serverless functions
Hooks (handle)             → Middleware (Edge or Serverless)
Static assets (/static)    → CDN with immutable caching
```

The adapter handles all of this mapping automatically. You do not need to configure Lambda function handlers, set up API Gateway routing, or manage CDN invalidation. The adapter reads your SvelteKit project structure and generates the right output for each route.

## Connect Your Repository

First, push your project to GitHub if you have not already:

```bash
git init
git add .
git commit -m "Initial commit - e-commerce store"
git remote add origin https://github.com/your-username/ecommerce-store.git
git push -u origin main
```

Then connect it to Vercel. You have two options:

### Option 1: Vercel Dashboard (Recommended for First Deploy)

Go to [vercel.com/new](https://vercel.com/new), click "Import Git Repository," and select your repo. Vercel auto-detects SvelteKit and configures the build settings. This is the easiest path for your first deployment.

### Option 2: Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Link your local project to a Vercel project
vercel link

# Or deploy directly (creates a new project if none exists)
vercel
```

The CLI is useful for scripting deployments, testing preview builds locally, and managing environment variables without leaving the terminal.

## Configure the SvelteKit Adapter

Install the Vercel adapter for SvelteKit:

```bash
npm install -D @sveltejs/adapter-vercel
```

Update your SvelteKit config:

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Use Node.js runtime (default)
      runtime: 'nodejs22.x',

      // Split routes into separate serverless functions for better cold starts
      // Each route becomes its own function, loaded independently
      split: false // Set to true for large apps with many routes
    })
  }
};

export default config;
```

The Vercel adapter automatically converts your SvelteKit routes into serverless functions. Static pages (prerendered) are served directly from the CDN, and dynamic routes (load functions, form actions, API routes) run as serverless functions.

### Understanding split: true vs false

By default (`split: false`), all your server-side code is bundled into a single serverless function. This is simpler and works well for most applications.

With `split: true`, each route gets its own serverless function. This has tradeoffs:

**Pros of splitting:**
- Smaller function size means faster cold starts for individual routes
- A crash in one route does not affect others
- Independent scaling and resource allocation

**Cons of splitting:**
- More functions to deploy and manage
- Cannot share in-memory state between routes (which you should not be doing anyway)
- Slightly longer deployment times

Use `split: true` when your application has many routes and cold start performance matters. For most e-commerce stores with under 50 routes, `split: false` is fine.

## Edge vs Serverless Runtime

Vercel offers two runtime environments for your functions. Understanding the difference is important for performance and compatibility.

### Serverless Functions (Node.js)

```typescript
// Standard serverless — runs in a full Node.js environment
// Default for all SvelteKit routes
export const config = {
  runtime: 'nodejs22.x'
};
```

Full Node.js environment. All npm packages work. Cold starts are 200-500ms. Functions run in a single region closest to your database.

### Edge Functions

```typescript
// Edge function — runs on Cloudflare Workers-like runtime at every CDN edge
// Faster cold starts but limited API surface
export const config = {
  runtime: 'edge'
};
```

Runs at every CDN edge location worldwide. Cold starts under 50ms. But the runtime is restricted: no `fs`, no `child_process`, no native modules. Many npm packages that depend on Node.js APIs will not work.

Per-route runtime configuration in SvelteKit:

```typescript
// src/routes/api/fast-endpoint/+server.ts
// This specific route runs at the edge
export const config = {
  runtime: 'edge'
};

export const GET: RequestHandler = async ({ url }) => {
  // Only use Web APIs here — no Node.js modules
  const data = await fetch('https://api.example.com/data');
  return json(await data.json());
};
```

```typescript
// src/routes/api/heavy-endpoint/+server.ts
// This route needs Node.js (e.g., for database drivers, image processing)
export const config = {
  runtime: 'nodejs22.x'
};

export const GET: RequestHandler = async () => {
  // Full Node.js — can use any npm package
  const data = await db.select().from(productsTable);
  return json(data);
};
```

**Decision rule:** Use Edge for routes that do not touch a database or Node.js-specific packages (auth checks, redirects, static data transforms, feature flags). Use Node.js for routes that need database access, file system operations, or native npm packages.

A common production pattern: run your SvelteKit `handle` hook at the edge for fast auth checking and feature flags, but keep your load functions and API routes as Node.js serverless functions for database access.

## Incremental Static Regeneration (ISR)

ISR combines the speed of static pages with the freshness of server-rendered pages. A page is prerendered at build time, served from the CDN cache, and regenerated in the background after a configurable time period.

```typescript
// src/routes/products/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const config = {
  isr: {
    // Regenerate this page at most once every 60 seconds
    expiration: 60,

    // Allow on-demand regeneration via a secret token
    // POST https://yoursite.com/products/cool-product?x-prerender-revalidate=YOUR_SECRET
    bypassToken: process.env.ISR_BYPASS_TOKEN
  }
};

export const load: PageServerLoad = async ({ params }) => {
  const product = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.slug, params.slug));

  return { product: product[0] };
};
```

ISR is ideal for product pages, blog posts, and any content that changes occasionally but does not need to be real-time. The first visitor after the expiration window gets a stale (but instant) response while Vercel regenerates the page in the background. The next visitor gets the fresh version.

### On-Demand Revalidation

When a product is updated in your admin panel, you can trigger immediate revalidation instead of waiting for the expiration:

```typescript
// src/routes/admin/products/+page.server.ts
export const actions: Actions = {
  update: async ({ request }) => {
    const formData = await request.formData();
    const slug = formData.get('slug') as string;

    // Update the product in the database
    await db.update(productsTable).set({ /* ... */ }).where(eq(productsTable.slug, slug));

    // Trigger on-demand revalidation for this specific page
    await fetch(`https://your-site.vercel.app/products/${slug}`, {
      method: 'HEAD',
      headers: {
        'x-prerender-revalidate': process.env.ISR_BYPASS_TOKEN!
      }
    });

    return { success: true };
  }
};
```

## Configure Environment Variables

Set your production environment variables in Vercel. This is one of the most common sources of deployment failures — missing or misconfigured environment variables.

```bash
# Using Vercel CLI
vercel env add DATABASE_URL production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add PUBLIC_STRIPE_KEY production

# List all configured variables
vercel env ls

# Pull environment variables to local .env file for testing
vercel env pull .env.local
```

In the Vercel dashboard: Project Settings > Environment Variables. Add each variable and set the scope (Production, Preview, Development).

Important rules:
- **Never use test API keys in production.** Use Vercel's environment scoping to have different keys per environment.
- **Variables prefixed with `PUBLIC_` are exposed to the client.** Only use this prefix for non-secret values like your Stripe publishable key.
- **Vercel encrypts environment variables at rest.** But they are available in plaintext to your serverless functions at runtime.
- **Preview deployments get Preview-scoped variables.** This lets you use a staging database for PR previews.

### Environment Variable Best Practices

```bash
# Production scope — only used in production deployments
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/store

# Preview scope — used in PR preview deployments (staging database)
DATABASE_URL=postgresql://user:pass@staging-db.example.com:5432/store_staging

# Development scope — used when running locally with `vercel dev`
DATABASE_URL=postgresql://user:pass@localhost:5432/store_dev
```

## Preview Deployments

Every pull request gets its own deployment URL automatically. This is one of Vercel's most valuable features for teams:

```
main branch    → yourstore.vercel.app (production)
feature/search → yourstore-feature-search-abc123.vercel.app (preview)
fix/cart-bug   → yourstore-fix-cart-bug-def456.vercel.app (preview)
```

Preview deployments use Preview-scoped environment variables, so they connect to your staging database, not production. Reviewers can click the link directly from the GitHub PR to test the changes.

You can also configure protection for preview deployments:

```json
// vercel.json
{
  "passwordProtection": {
    "enabled": true,
    "password": "staging-password"
  }
}
```

## Deploy

Trigger your first deployment:

```bash
# Deploy to preview (creates a unique URL)
vercel

# Deploy to production (updates your production URL)
vercel --prod
```

If you connected your GitHub repo, pushing to `main` automatically deploys to production:

```bash
git add .
git commit -m "Ready for production"
git push origin main
```

Vercel will:
1. Clone your repository
2. Install dependencies (`npm install`)
3. Run your build command (`vite build`)
4. Deploy static assets to CDN and serverless functions to the function runtime
5. Run any post-deployment checks

Check the deployment logs in the Vercel dashboard if anything fails. The most common failures are missing environment variables, build errors from TypeScript, and incompatible Node.js versions.

## Set Up the Stripe Webhook

After deployment, update your Stripe webhook URL to point to your production domain:

```
1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: https://your-store.vercel.app/api/stripe-webhook
3. Select events: checkout.session.completed
4. Copy the webhook signing secret
5. Add it as STRIPE_WEBHOOK_SECRET in Vercel env vars
6. Redeploy to pick up the new variable: vercel --prod
```

## Custom Domain

Connect your own domain through the Vercel dashboard:

```
1. Go to your project > Settings > Domains
2. Add your domain: yourstorename.com
3. Update your DNS records:
   - Type: A
   - Name: @
   - Value: 76.76.21.21

   - Type: CNAME
   - Name: www
   - Value: cname.vercel-dns.com

4. Vercel automatically provisions an SSL certificate via Let's Encrypt
```

Vercel handles HTTPS, certificate renewals, and redirect from `www` to non-`www` (or vice versa) automatically. SSL certificates are provisioned within minutes of DNS propagation.

## Monitoring and Logs

Vercel provides built-in monitoring, but understanding what to look at is crucial:

### Runtime Logs

```bash
# Stream logs in real time from the CLI
vercel logs your-project --follow

# View logs for a specific deployment
vercel logs your-project --since 1h
```

In the dashboard: Project > Deployments > select a deployment > Functions tab. You can filter by function name, status code, and time range.

### Vercel Analytics

Enable Web Analytics and Speed Insights in your project settings:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { dev } from '$app/environment';
  import { inject } from '@vercel/analytics';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

  if (!dev) {
    inject();
    injectSpeedInsights();
  }
</script>
```

```bash
npm install @vercel/analytics @vercel/speed-insights
```

Analytics shows page views, unique visitors, and referrers. Speed Insights tracks real user performance metrics: LCP, FID, CLS, TTFB.

### Monitoring Checklist for Production

```
Critical Alerts (set up immediately):
  [ ] Function error rate exceeds 1%
  [ ] P95 response time exceeds 3 seconds
  [ ] Build failures on main branch

Daily Review:
  [ ] Check error logs for recurring errors
  [ ] Review slowest functions (cold starts vs execution time)
  [ ] Monitor serverless function invocation counts (cost)

Weekly Review:
  [ ] Core Web Vitals trends (Speed Insights)
  [ ] Traffic patterns (unusual spikes or drops)
  [ ] Function memory usage (right-size your limits)
```

## Deployment Hooks and CI/CD

Deployment hooks let you trigger deployments from external services:

```bash
# Create a deploy hook in Vercel Dashboard > Settings > Git > Deploy Hooks
# This gives you a URL like:
# https://api.vercel.com/v1/integrations/deploy/prj_xxxx/yyyy

# Trigger from a CMS webhook (when content changes):
curl -X POST https://api.vercel.com/v1/integrations/deploy/prj_xxxx/yyyy

# Trigger from a GitHub Action:
# .github/workflows/deploy.yml
# - name: Trigger Vercel Deploy
#   run: curl -X POST ${{ secrets.VERCEL_DEPLOY_HOOK }}
```

## Rollback

When a deployment goes wrong, Vercel makes rollback trivial:

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote [deployment-url]
```

Or in the dashboard: Deployments > find the last good deployment > three-dot menu > "Promote to Production." The rollback is instant because it just changes which deployment the production URL points to. No rebuild required.

**War story:** I once deployed a migration that broke the checkout flow at 2 AM. By the time we noticed (15 minutes, thanks to error rate alerts), hundreds of carts had failed. A one-click rollback in the Vercel dashboard restored the previous version in under 5 seconds. The rollback did not undo the database migration, of course — that required a separate fix. But it stopped the bleeding immediately while we worked on the database. Lesson: always make database migrations backward-compatible so that rolling back the code does not break against the new schema.

## Vercel Configuration File

For advanced configuration, create a `vercel.json` at your project root:

```json
{
  "framework": "sveltekit",
  "regions": ["iad1"],
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "https://yourdomain.com" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, DELETE" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ],
  "redirects": [
    { "source": "/old-path", "destination": "/new-path", "permanent": true }
  ]
}
```

## Alternative Deployment Platforms

Vercel is not the only option. Each platform has its strengths. Here is an honest comparison:

### Netlify

```bash
npm install -D @sveltejs/adapter-netlify
```

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-netlify';

export default {
  kit: {
    adapter: adapter({
      edge: false,       // Use standard serverless functions
      split: false       // Bundle into one function
    })
  }
};
```

**Strengths:** Generous free tier, built-in forms, identity service, excellent documentation, simpler pricing model.

**Weaknesses:** Serverless functions have slightly higher cold starts than Vercel. Edge functions are more limited.

**Best for:** Smaller projects, static-heavy sites, teams that want an all-in-one platform with built-in identity and forms.

### Cloudflare Pages

```bash
npm install -D @sveltejs/adapter-cloudflare
```

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-cloudflare';

export default {
  kit: {
    adapter: adapter()
  }
};
```

**Strengths:** Fastest edge network (runs on Cloudflare Workers), generous free tier, built-in D1 (SQLite) and R2 (object storage), no cold starts.

**Weaknesses:** Workers runtime is not full Node.js — many npm packages that use Node APIs do not work. Requires Cloudflare-compatible database (D1, Turso, PlanetScale).

**Best for:** Performance-critical applications, global audiences, teams already using Cloudflare's ecosystem.

### Fly.io

```bash
npm install -D @sveltejs/adapter-node
```

```dockerfile
# Dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
RUN npm ci --production
EXPOSE 3000
CMD ["node", "build"]
```

```bash
fly launch
fly deploy
```

**Strengths:** Full Docker containers (run anything), global deployment with Fly Machines, persistent volumes, built-in Postgres, WebSocket support, SSH access.

**Weaknesses:** More operational complexity (you manage the container), no built-in CI/CD (bring your own), pricing can be unpredictable.

**Best for:** Applications that need WebSockets, persistent connections, custom runtimes, or full control over the server environment.

### Decision Matrix

```
Feature           Vercel    Netlify   Cloudflare  Fly.io
─────────         ──────    ───────   ──────────  ──────
SvelteKit support Excellent Good      Good        Good
Free tier         Generous  Generous  Very generous Limited
Cold starts       ~200ms    ~300ms    None        None
Edge functions    Yes       Yes       Yes (all)   No (containers)
WebSockets        No*       No        Yes (Durable) Yes
Custom Docker     No        No        No          Yes
Database hosting  No        No        D1 (SQLite) Postgres
Global deploy     Yes       Yes       Yes         Yes
Preview deploys   Automatic Automatic Automatic   Manual
Pricing model     Per-seat  Per-seat  Per-request  Per-VM

* Vercel supports WebSockets through third-party services, not natively
```

## Verify the Deployment

After deploying, test everything on the live site. Do not skip this. Things that work locally often break in production due to environment differences.

```
Deployment Checklist:
[ ] Homepage loads correctly (check for hydration errors in console)
[ ] Products display with images (check image URLs resolve)
[ ] Filtering and pagination work
[ ] Adding to cart works (check localStorage/cookies)
[ ] Checkout form validates correctly
[ ] Stripe payment completes (make a real test purchase)
[ ] Order appears in admin panel
[ ] Admin routes are protected (try accessing /admin logged out)
[ ] Mobile responsive layout works (test on real device)
[ ] Page load time is under 3 seconds (check with PageSpeed Insights)
[ ] All environment variables are set (check serverless function logs)
[ ] Error pages display correctly (visit /nonexistent-page)
[ ] Forms work without JavaScript (disable JS and submit a form)
[ ] HTTPS redirect works (visit http:// version)
[ ] Custom domain resolves correctly
[ ] OG meta tags render in social previews (use Facebook debugger)
```

### Automated Smoke Tests

For production, automate the verification with a simple health check:

```typescript
// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Check Stripe API
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    });
    checks.stripe = res.ok ? 'ok' : 'error';
  } catch {
    checks.stripe = 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');

  return json(
    { status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
};
```

Point an uptime monitor (UptimeRobot, Better Uptime, or Vercel's built-in checks) at `/api/health`. You will be notified within minutes if something breaks.

## Try It

1. **Deploy your e-commerce store to Vercel.** Complete a full purchase flow on the live site using Stripe test mode. Verify the order shows up in both your Stripe dashboard and your admin panel.

2. **Set up preview deployments.** Create a new Git branch, make a visible change (update the homepage heading), push the branch, and open a pull request. Verify that Vercel creates a preview deployment. Visit the preview URL and confirm the change is visible. Merge the PR and verify production updates.

3. **Add a health check endpoint** at `/api/health` that tests database connectivity and Stripe API access. Set up an uptime monitor that hits this endpoint every 5 minutes and alerts you on failure.

4. **Configure ISR** for your product pages with a 60-second expiration. Update a product title in your admin panel and trigger on-demand revalidation. Visit the product page and confirm it shows the updated title without a full redeploy.

5. **Practice a rollback.** Deploy a version with a deliberate bug (a typo on the homepage). Then use `vercel promote` or the dashboard to roll back to the previous working deployment. Measure how long the entire rollback process takes.

## Key Takeaways

- The `@sveltejs/adapter-vercel` converts SvelteKit routes into serverless functions and static assets automatically — no manual function configuration needed
- Set all environment variables in the Vercel dashboard before your first production deployment, with different values per scope (Production, Preview, Development)
- Every push to your main branch triggers an automatic production deployment; every PR gets a preview deployment with its own URL
- Edge Functions are faster (no cold starts) but limited to Web APIs — use them for middleware, not database queries
- ISR gives you the performance of static pages with the freshness of server rendering — ideal for product pages and blog posts
- Rollbacks are instant on Vercel — they just change which deployment the production URL points to, no rebuild needed
- Always verify the full user flow on the live deployment — environment differences between local and production catch many developers off guard
- A health check endpoint lets you detect outages within minutes instead of hearing about them from users
- Alternative platforms (Netlify, Cloudflare Pages, Fly.io) each have strengths — choose based on your specific requirements around edge computing, WebSocket support, and operational complexity
- Update your Stripe webhook endpoint to your production URL after deploying — this is the most commonly forgotten step
