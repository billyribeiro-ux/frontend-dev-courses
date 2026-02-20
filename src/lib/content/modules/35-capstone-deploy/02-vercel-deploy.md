# Deploying to Vercel

Your store is built, tested, and ready. In this lesson you will deploy it to Vercel — connect your repository, configure environment variables, set up the SvelteKit adapter, deploy, and optionally connect a custom domain. By the end of this lesson, your store will be live on the internet.

Vercel is an excellent fit for SvelteKit because it supports serverless functions, edge rendering, and automatic deployments from Git. Every push to your main branch triggers a new deployment.

## Connect Your Repository

First, push your project to GitHub if you have not already:

```bash
git init
git add .
git commit -m "Initial commit - e-commerce store"
git remote add origin https://github.com/your-username/ecommerce-store.git
git push -u origin main
```

Then connect it to Vercel:

```bash
# Install Vercel CLI
npm install -g vercel

# Link your project
vercel link

# Or deploy directly
vercel
```

Alternatively, go to [vercel.com/new](https://vercel.com/new), click "Import Git Repository," and select your repo. Vercel detects SvelteKit automatically.

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
      runtime: 'nodejs22.x'
    })
  }
};

export default config;
```

The Vercel adapter automatically converts your SvelteKit routes into serverless functions. Static pages are served from the CDN, and dynamic routes (load functions, form actions, API routes) run as serverless functions.

## Configure Environment Variables

Set your production environment variables in Vercel. You can do this through the dashboard or the CLI:

```bash
# Using Vercel CLI
vercel env add DATABASE_URL production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add PUBLIC_STRIPE_KEY production
```

In the Vercel dashboard, go to your project settings, then "Environment Variables." Add each variable and set it to the production scope.

Important rules:
- Never use test API keys in production environment variables
- Variables prefixed with `PUBLIC_` are exposed to the client — only use this for non-secret values
- Vercel encrypts environment variables at rest

## Deploy

Trigger your first deployment:

```bash
# Deploy to preview
vercel

# Deploy to production
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
2. Install dependencies
3. Run your build command (`vite build`)
4. Deploy the output

Check the deployment logs in the Vercel dashboard if anything fails.

## Set Up the Stripe Webhook

After deployment, update your Stripe webhook URL to point to your production domain:

```
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: https://your-store.vercel.app/api/stripe-webhook
3. Select events: checkout.session.completed
4. Copy the webhook signing secret
5. Add it as STRIPE_WEBHOOK_SECRET in Vercel env vars
6. Redeploy to pick up the new variable
```

## Custom Domain

Connect your own domain through the Vercel dashboard:

```
1. Go to your project → Settings → Domains
2. Add your domain: yourstorename.com
3. Update your DNS records:
   - Type: CNAME
   - Name: @ (or www)
   - Value: cname.vercel-dns.com
4. Vercel automatically provisions an SSL certificate
```

Vercel handles HTTPS, renewals, and redirect from `www` to non-`www` (or vice versa) automatically.

## Verify the Deployment

After deploying, test everything on the live site:

```
Deployment Checklist:
[ ] Homepage loads correctly
[ ] Products display with images
[ ] Filtering and pagination work
[ ] Adding to cart works
[ ] Checkout form validates
[ ] Stripe payment completes (use a real test purchase)
[ ] Order appears in admin panel
[ ] Admin routes are protected (try accessing /admin logged out)
[ ] Mobile responsive layout works
[ ] Page load time is under 3 seconds
```

## Try It

Deploy your e-commerce store to Vercel. Complete a full purchase flow on the live site using Stripe's test mode (you can keep test keys initially). Verify the order shows up in both your Stripe dashboard and your admin panel. Then switch to live Stripe keys and make a real one-cent purchase to confirm everything works end to end.

## Key Takeaways

- The `@sveltejs/adapter-vercel` converts SvelteKit routes into serverless functions and static assets automatically
- Set all environment variables in the Vercel dashboard before your first production deployment
- Every push to your main branch triggers an automatic production deployment
- Update your Stripe webhook endpoint to your production URL after deploying
- Vercel handles SSL certificates, CDN distribution, and domain configuration for you
- Always verify the full user flow on the live deployment — do not assume it works just because it worked locally
