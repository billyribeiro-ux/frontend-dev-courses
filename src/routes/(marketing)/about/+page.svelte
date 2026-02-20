<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { GraduationCap, Heartbeat, Target } from 'phosphor-svelte';
</script>

<MetaTags
	title="About | Svelte 5 Bootcamp"
	description="Why we built the Svelte 5 Bootcamp and our teaching philosophy."
/>

<div class="about-page">
	<h1>About This Course</h1>

	<div class="about-grid">
		<div class="about-card">
			<GraduationCap size={32} weight="duotone" />
			<h2>Built for True Beginners</h2>
			<p>
				Most coding courses teach JavaScript first, then make you re-learn everything when you switch
				to a framework. We teach HTML, CSS, JavaScript, and TypeScript directly inside Svelte
				components from day one — so everything you learn is immediately practical.
			</p>
		</div>

		<div class="about-card">
			<Target size={32} weight="duotone" />
			<h2>Project-Based Learning</h2>
			<p>
				Every single module includes a real-world project. You'll build greeting cards, restaurant
				menus, weather dashboards, notes apps, and a full e-commerce store — not abstract exercises
				that gather dust.
			</p>
		</div>

		<div class="about-card">
			<Heartbeat size={32} weight="duotone" />
			<h2>Modern Stack, Real Skills</h2>
			<p>
				Svelte 5 runes, SvelteKit SSR, Tailwind CSS v4, GSAP animations, Drizzle ORM, Stripe
				payments, and Google SEO best practices for 2026. You'll learn what companies actually use.
			</p>
		</div>
	</div>
</div>

<style>
	.about-page {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--space-3xl) var(--space-xl);
	}

	h1 {
		font-size: var(--text-3xl);
		text-align: center;
		margin: 0 0 var(--space-2xl);
	}

	.about-grid {
		display: grid;
		gap: var(--space-xl);
	}

	.about-card {
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.about-card :global(svg) {
		color: var(--color-brand);
		margin-bottom: var(--space-md);
	}

	.about-card h2 {
		font-size: var(--text-xl);
		margin: 0 0 var(--space-sm);
	}

	.about-card p {
		color: var(--color-text-secondary);
		line-height: 1.7;
		margin: 0;
	}
</style>
