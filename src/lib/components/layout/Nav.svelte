<script lang="ts">
	import { page } from '$app/state';
	import { Code, SignIn, UserCircle, List, X } from 'phosphor-svelte';

	let { user = null }: { user: App.Locals['user'] } = $props();
	let mobileMenuOpen = $state(false);
</script>

<nav class="nav">
	<div class="nav-inner">
		<a href="/" class="logo">
			<Code size={28} weight="bold" />
			<span>Svelte Bootcamp</span>
		</a>

		<button class="mobile-toggle" onclick={() => (mobileMenuOpen = !mobileMenuOpen)}>
			{#if mobileMenuOpen}
				<X size={24} />
			{:else}
				<List size={24} />
			{/if}
		</button>

		<div class="nav-links" class:open={mobileMenuOpen}>
			<a href="/pricing" class:active={page.url.pathname === '/pricing'}>Pricing</a>
			<a href="/about" class:active={page.url.pathname === '/about'}>About</a>

			{#if user}
				<a href="/course" class="btn-nav-primary">
					<UserCircle size={18} />
					My Course
				</a>
			{:else}
				<a href="/login" class:active={page.url.pathname === '/login'}>Log In</a>
				<a href="/signup" class="btn-nav-primary">
					<SignIn size={18} />
					Get Started
				</a>
			{/if}
		</div>
	</div>
</nav>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		backdrop-filter: blur(8px);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-sm) var(--space-xl);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-weight: 700;
		font-size: var(--text-lg);
		color: var(--color-text);
	}

	.logo:hover {
		color: var(--color-brand);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
	}

	.nav-links a {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: color var(--transition-fast);
	}

	.nav-links a:hover,
	.nav-links a.active {
		color: var(--color-brand);
	}

	.btn-nav-primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: var(--color-brand);
		color: white !important;
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius-md);
		font-weight: 600;
	}

	.btn-nav-primary:hover {
		background: var(--color-brand-dark);
		color: white !important;
	}

	.mobile-toggle {
		display: none;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text);
	}

	@media (max-width: 768px) {
		.mobile-toggle {
			display: block;
		}

		.nav-links {
			display: none;
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			flex-direction: column;
			background: var(--color-bg);
			border-bottom: 1px solid var(--color-border);
			padding: var(--space-md) var(--space-xl);
			gap: var(--space-md);
		}

		.nav-links.open {
			display: flex;
		}
	}
</style>
