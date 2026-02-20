<script lang="ts">
	import { page } from '$app/state';
	import { WarningCircle, ArrowLeft } from 'phosphor-svelte';
</script>

<div class="error-page">
	<WarningCircle size={64} weight="duotone" color="var(--color-error)" />
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something went wrong.'}</p>
	<a href="/" class="back-link">
		<ArrowLeft size={16} />
		Back to Home
	</a>
</div>

<style>
	.error-page {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: var(--space-3xl) var(--space-xl);
	}

	h1 {
		font-size: var(--text-4xl);
		margin: var(--space-md) 0 var(--space-xs);
	}

	p {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-brand);
		font-weight: 600;
	}
</style>
