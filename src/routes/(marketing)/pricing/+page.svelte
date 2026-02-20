<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { CheckCircle, ArrowRight } from 'phosphor-svelte';

	const included = [
		'35 in-depth modules',
		'10+ real-world projects',
		'In-browser code editor (no setup needed)',
		'HTML, CSS, JS, TS taught inside Svelte',
		'GSAP animations & Phosphor Icons',
		'Database, auth & Stripe payments',
		'SEO & Core Web Vitals optimization',
		'Full capstone: production e-commerce store',
		'Lifetime access to all content',
		'Future updates included'
	];
</script>

<MetaTags
	title="Pricing | Svelte 5 Bootcamp"
	description="One-time payment for lifetime access. Learn Svelte 5 from scratch with 35 hands-on modules."
/>

<div class="pricing-page">
	<h1>Simple, One-Time Pricing</h1>
	<p class="subtitle">Pay once, learn forever. No subscriptions, no hidden fees.</p>

	<div class="pricing-card">
		<div class="price-tag">
			<span class="currency">$</span>
			<span class="amount">99</span>
		</div>
		<p class="price-note">One-time payment — lifetime access</p>

		<ul class="features-list">
			{#each included as item}
				<li>
					<CheckCircle size={18} weight="fill" />
					{item}
				</li>
			{/each}
		</ul>

		<a href="/signup" class="btn-primary">
			Get Started Now <ArrowRight size={18} weight="bold" />
		</a>
	</div>
</div>

<style>
	.pricing-page {
		max-width: 560px;
		margin: 0 auto;
		padding: var(--space-3xl) var(--space-xl);
		text-align: center;
	}

	h1 {
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-sm);
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2xl);
	}

	.pricing-card {
		background: var(--color-bg);
		border: 2px solid var(--color-brand);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		box-shadow: var(--shadow-xl);
	}

	.price-tag {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: 2px;
	}

	.currency {
		font-size: var(--text-2xl);
		font-weight: 700;
		margin-top: 8px;
	}

	.amount {
		font-size: 4rem;
		font-weight: 800;
		line-height: 1;
	}

	.price-note {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		margin: var(--space-sm) 0 var(--space-xl);
	}

	.features-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-xl);
		text-align: left;
	}

	.features-list li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.features-list li :global(svg) {
		color: var(--color-success);
		flex-shrink: 0;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		background: var(--color-brand);
		color: white;
		padding: var(--space-md) var(--space-2xl);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--text-lg);
		transition: all var(--transition-fast);
		width: 100%;
		justify-content: center;
	}

	.btn-primary:hover {
		background: var(--color-brand-dark);
		color: white;
		transform: translateY(-1px);
	}
</style>
