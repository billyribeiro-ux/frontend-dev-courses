<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { CheckCircle, ArrowRight } from 'phosphor-svelte';
</script>

<MetaTags title="Welcome! | Svelte 5 Bootcamp" description="Your purchase is complete. Time to start learning." />

<div class="success-page">
	<div class="success-card">
		<CheckCircle size={64} weight="fill" color="var(--color-success)" />
		<h1>You're In!</h1>
		<p>Your payment was successful. Welcome to the Svelte 5 Bootcamp!</p>
		<a href="/course" class="btn-primary">
			Start Module 1 <ArrowRight size={18} weight="bold" />
		</a>
	</div>
</div>

<style>
	.success-page {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-3xl) var(--space-xl);
	}

	.success-card {
		text-align: center;
		max-width: 420px;
	}

	h1 {
		font-size: var(--text-3xl);
		margin: var(--space-lg) 0 var(--space-sm);
	}

	p {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-xl);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		background: var(--color-brand);
		color: white;
		padding: var(--space-sm) var(--space-xl);
		border-radius: var(--radius-md);
		font-weight: 600;
		transition: all var(--transition-fast);
	}

	.btn-primary:hover {
		background: var(--color-brand-dark);
		color: white;
	}
</style>
