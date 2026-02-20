<script lang="ts">
	import { Code, GithubLogo, TwitterLogo } from 'phosphor-svelte';
</script>

<footer class="footer">
	<div class="footer-inner">
		<div class="footer-brand">
			<div class="logo">
				<Code size={24} weight="bold" />
				<span>Svelte Bootcamp</span>
			</div>
			<p>Learn Svelte 5, SvelteKit, and modern web development from absolute zero to production-ready.</p>
		</div>

		<div class="footer-links">
			<div class="footer-col">
				<h4>Course</h4>
				<a href="/pricing">Pricing</a>
				<a href="/about">About</a>
				<a href="/course">Curriculum</a>
			</div>
			<div class="footer-col">
				<h4>Connect</h4>
				<a href="https://github.com" target="_blank" rel="noopener">
					<GithubLogo size={16} /> GitHub
				</a>
				<a href="https://twitter.com" target="_blank" rel="noopener">
					<TwitterLogo size={16} /> Twitter
				</a>
			</div>
		</div>
	</div>

	<div class="footer-bottom">
		<p>&copy; {new Date().getFullYear()} Svelte Bootcamp. All rights reserved.</p>
	</div>
</footer>

<style>
	.footer {
		background: var(--color-bg-secondary);
		border-top: 1px solid var(--color-border);
		margin-top: var(--space-3xl);
	}

	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-3xl) var(--space-xl) var(--space-xl);
		display: flex;
		justify-content: space-between;
		gap: var(--space-3xl);
		flex-wrap: wrap;
	}

	.footer-brand {
		max-width: 360px;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-weight: 700;
		font-size: var(--text-lg);
		color: var(--color-text);
		margin-bottom: var(--space-sm);
	}

	.footer-brand p {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		line-height: 1.6;
	}

	.footer-links {
		display: flex;
		gap: var(--space-3xl);
	}

	.footer-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.footer-col h4 {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--space-xs);
	}

	.footer-col a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.footer-col a:hover {
		color: var(--color-brand);
	}

	.footer-bottom {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-md) var(--space-xl);
		border-top: 1px solid var(--color-border);
	}

	.footer-bottom p {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		text-align: center;
	}
</style>
