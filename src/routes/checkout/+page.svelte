<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { Lock } from 'phosphor-svelte';

	let { data } = $props();
</script>

<MetaTags
	title="Checkout | Svelte 5 Bootcamp"
	description="Complete your purchase to access all 35 modules."
/>

<div class="checkout-page">
	<div class="checkout-card">
		<div class="checkout-header">
			<Lock size={24} weight="duotone" />
			<h1>Complete Your Purchase</h1>
		</div>

		<div class="order-summary">
			<div class="order-item">
				<span>Svelte 5 Bootcamp — Lifetime Access</span>
				<span class="price">$99</span>
			</div>
		</div>

		<div class="payment-form">
			<p class="payment-note">
				Payment is processed securely via Stripe. Your card details never touch our servers.
			</p>
			<!-- Stripe PaymentElement will be mounted here once Stripe.js is loaded -->
			<div id="payment-element"></div>
			<button class="btn-primary" type="button">Pay $99</button>
		</div>
	</div>
</div>

<style>
	.checkout-page {
		max-width: 500px;
		margin: 0 auto;
		padding: var(--space-3xl) var(--space-xl);
	}

	.checkout-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		box-shadow: var(--shadow-lg);
	}

	.checkout-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-xl);
	}

	.checkout-header :global(svg) {
		color: var(--color-brand);
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.order-summary {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		margin-bottom: var(--space-xl);
		background: var(--color-bg-secondary);
	}

	.order-item {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
	}

	.price {
		font-weight: 700;
	}

	.payment-note {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0 0 var(--space-md);
	}

	#payment-element {
		margin-bottom: var(--space-md);
		min-height: 40px;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.btn-primary {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-brand);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-base);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.btn-primary:hover {
		background: var(--color-brand-dark);
	}
</style>
