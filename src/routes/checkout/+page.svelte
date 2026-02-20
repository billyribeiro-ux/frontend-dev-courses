<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { Lock, CircleNotch, WarningCircle } from 'phosphor-svelte';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	let { data } = $props();

	let stripe: any = $state(null);
	let elements: any = $state(null);
	let loading = $state(true);
	let processing = $state(false);
	let errorMessage = $state('');

	onMount(async () => {
		try {
			const { loadStripe } = await import('@stripe/stripe-js');
			stripe = await loadStripe(env.PUBLIC_STRIPE_KEY ?? '');

			if (stripe && data.clientSecret) {
				elements = stripe.elements({
					clientSecret: data.clientSecret,
					appearance: {
						theme: 'stripe',
						variables: { colorPrimary: '#ff3e00', borderRadius: '8px' }
					}
				});

				const paymentElement = elements.create('payment');
				paymentElement.mount('#payment-element');
				paymentElement.on('ready', () => { loading = false; });
			} else {
				loading = false;
			}
		} catch {
			loading = false;
			errorMessage = 'Failed to load payment form. Please refresh.';
		}
	});

	async function handleSubmit() {
		if (!stripe || !elements) return;
		processing = true;
		errorMessage = '';

		const { error } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: `${window.location.origin}/checkout/success`
			}
		});

		if (error) {
			errorMessage = error.message ?? 'An error occurred during payment.';
			processing = false;
		}
	}
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

		{#if errorMessage}
			<div class="error-message">
				<WarningCircle size={16} />
				{errorMessage}
			</div>
		{/if}

		<div class="payment-form">
			<div id="payment-element">
				{#if loading}
					<div class="loading-state">
						<CircleNotch size={20} class="spin" />
						<span>Loading payment form...</span>
					</div>
				{/if}
			</div>
			<button
				class="btn-primary"
				type="button"
				onclick={handleSubmit}
				disabled={loading || processing || !stripe}
			>
				{#if processing}
					<CircleNotch size={16} class="spin" />
					Processing...
				{:else}
					Pay $99
				{/if}
			</button>
			<p class="payment-note">
				Payment is processed securely via Stripe. Your card details never touch our servers.
			</p>
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

	.error-message {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: #fef2f2;
		color: var(--color-error);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		margin-bottom: var(--space-md);
	}

	#payment-element {
		margin-bottom: var(--space-md);
		min-height: 40px;
	}

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-lg);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	.btn-primary {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-brand);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-base);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
		font-family: inherit;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-brand-dark);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.payment-note {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: var(--space-md) 0 0;
		text-align: center;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
