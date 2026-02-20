<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { generateCourseJsonLd } from '$lib/utils/seo.js';
	import { Rocket, Code, Lightning, Trophy, CheckCircle, ArrowRight } from 'phosphor-svelte';
	import { onMount } from 'svelte';

	const courseJsonLd = generateCourseJsonLd({
		name: 'Svelte 5 Bootcamp: Zero to Production',
		description:
			'Learn Svelte 5, SvelteKit, HTML, CSS, JavaScript, and TypeScript from absolute scratch. 35 modules with real-world projects.',
		provider: 'Svelte Bootcamp',
		url: 'https://sveltebootcamp.dev'
	});

	const features = [
		{
			icon: Code,
			title: 'Learn by Building',
			description: 'Every module includes a real-world project. No abstract theory — you build from day one.'
		},
		{
			icon: Lightning,
			title: 'Svelte-First Approach',
			description:
				"HTML, CSS, JS, and TypeScript taught directly inside Svelte. No switching frameworks halfway through."
		},
		{
			icon: Rocket,
			title: 'Zero to Production',
			description:
				'Start as a complete beginner, end by deploying a full e-commerce platform with payments and auth.'
		},
		{
			icon: Trophy,
			title: '35 Modules, 10+ Projects',
			description:
				'From greeting cards to e-commerce stores. Each module builds on the last with progressive complexity.'
		}
	];

	const curriculum = [
		{ phase: 1, title: 'Foundations', modules: '1-8', desc: 'HTML, CSS, JS basics inside Svelte with in-browser editor' },
		{ phase: 2, title: 'Intermediate', modules: '9-16', desc: 'VS Code setup, routing, TypeScript, Tailwind, GSAP animations' },
		{ phase: 3, title: 'Full-Stack', modules: '17-24', desc: 'Databases, auth, APIs, SEO, Stripe payments' },
		{ phase: 4, title: 'Advanced', modules: '25-30', desc: 'Real-time features, testing, accessibility, performance' },
		{ phase: 5, title: 'Capstone', modules: '31-35', desc: 'Build & deploy a production e-commerce platform' }
	];

	let heroRef = $state<HTMLElement | null>(null);

	onMount(async () => {
		if (!heroRef) return;
		const { gsap } = await import('$lib/utils/gsap.js');

		gsap.from(heroRef.querySelectorAll('.hero-animate'), {
			y: 40,
			opacity: 0,
			duration: 0.8,
			stagger: 0.15,
			ease: 'power3.out'
		});
	});
</script>

<MetaTags
	title="Svelte 5 Bootcamp | Learn Web Development from Scratch"
	description="The complete Svelte 5 course for absolute beginners. Learn HTML, CSS, JavaScript, TypeScript, and SvelteKit through 35 hands-on modules with real-world projects."
	jsonLd={courseJsonLd}
/>

<!-- Hero -->
<section class="hero" bind:this={heroRef}>
	<div class="hero-inner">
		<div class="hero-badge hero-animate">New for 2026</div>
		<h1 class="hero-animate">
			Learn <span class="brand">Svelte 5</span> from
			<span class="brand">Scratch</span>
		</h1>
		<p class="hero-subtitle hero-animate">
			The complete bootcamp for absolute beginners. Master HTML, CSS, JavaScript, TypeScript, and
			SvelteKit through 35 hands-on modules with real-world projects.
		</p>
		<div class="hero-cta hero-animate">
			<a href="/signup" class="btn-primary">
				Start Learning <ArrowRight size={18} weight="bold" />
			</a>
			<a href="/pricing" class="btn-secondary">View Pricing</a>
		</div>
		<div class="hero-proof hero-animate">
			<div class="proof-item">
				<CheckCircle size={18} weight="fill" />
				<span>No coding experience needed</span>
			</div>
			<div class="proof-item">
				<CheckCircle size={18} weight="fill" />
				<span>35 modules, 10+ projects</span>
			</div>
			<div class="proof-item">
				<CheckCircle size={18} weight="fill" />
				<span>Build & deploy to production</span>
			</div>
		</div>
	</div>
</section>

<!-- Features -->
<section class="features">
	<div class="features-inner">
		<h2>Why This Course is Different</h2>
		<div class="features-grid">
			{#each features as feature}
				<div class="feature-card">
					<div class="feature-icon">
						<feature.icon size={28} weight="duotone" />
					</div>
					<h3>{feature.title}</h3>
					<p>{feature.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- Curriculum Overview -->
<section class="curriculum">
	<div class="curriculum-inner">
		<h2>Course Curriculum</h2>
		<p class="curriculum-subtitle">
			5 phases taking you from zero to building production-grade applications.
		</p>
		<div class="phases">
			{#each curriculum as phase}
				<div class="phase-card">
					<div class="phase-number">Phase {phase.phase}</div>
					<h3>{phase.title}</h3>
					<p class="phase-modules">Modules {phase.modules}</p>
					<p>{phase.desc}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- CTA -->
<section class="cta">
	<div class="cta-inner">
		<h2>Ready to Start Building?</h2>
		<p>Join now and go from zero to deploying production Svelte applications.</p>
		<a href="/signup" class="btn-primary btn-lg">
			Start Your Journey <ArrowRight size={20} weight="bold" />
		</a>
	</div>
</section>

<style>
	.hero {
		padding: var(--space-3xl) var(--space-xl);
		text-align: center;
		background: linear-gradient(180deg, var(--color-bg) 0%, var(--color-bg-secondary) 100%);
	}

	.hero-inner {
		max-width: 800px;
		margin: 0 auto;
	}

	.hero-badge {
		display: inline-block;
		background: var(--color-brand);
		color: white;
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--space-lg);
	}

	h1 {
		font-size: var(--text-5xl);
		font-weight: 800;
		line-height: 1.1;
		margin: 0 0 var(--space-lg);
		letter-spacing: -0.02em;
	}

	.brand {
		color: var(--color-brand);
	}

	.hero-subtitle {
		font-size: var(--text-lg);
		color: var(--color-text-secondary);
		max-width: 600px;
		margin: 0 auto var(--space-xl);
		line-height: 1.7;
	}

	.hero-cta {
		display: flex;
		gap: var(--space-md);
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: var(--space-xl);
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
		font-size: var(--text-base);
		transition: all var(--transition-fast);
	}

	.btn-primary:hover {
		background: var(--color-brand-dark);
		color: white;
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		padding: var(--space-sm) var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-weight: 600;
		color: var(--color-text);
		transition: all var(--transition-fast);
	}

	.btn-secondary:hover {
		border-color: var(--color-brand);
		color: var(--color-brand);
	}

	.btn-lg {
		padding: var(--space-md) var(--space-2xl);
		font-size: var(--text-lg);
	}

	.hero-proof {
		display: flex;
		gap: var(--space-lg);
		justify-content: center;
		flex-wrap: wrap;
	}

	.proof-item {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.proof-item :global(svg) {
		color: var(--color-success);
	}

	.features {
		padding: var(--space-3xl) var(--space-xl);
	}

	.features-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.features-inner h2 {
		text-align: center;
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-2xl);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: var(--space-xl);
	}

	.feature-card {
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition: all var(--transition-base);
	}

	.feature-card:hover {
		border-color: var(--color-brand);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	.feature-icon {
		color: var(--color-brand);
		margin-bottom: var(--space-md);
	}

	.feature-card h3 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-sm);
	}

	.feature-card p {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		line-height: 1.6;
		margin: 0;
	}

	.curriculum {
		padding: var(--space-3xl) var(--space-xl);
		background: var(--color-bg-secondary);
	}

	.curriculum-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.curriculum-inner h2 {
		text-align: center;
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-sm);
	}

	.curriculum-subtitle {
		text-align: center;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2xl);
	}

	.phases {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-md);
	}

	.phase-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
	}

	.phase-number {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-brand);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--space-xs);
	}

	.phase-card h3 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-xs);
	}

	.phase-modules {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--space-sm);
	}

	.phase-card p:last-child {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.cta {
		padding: var(--space-3xl) var(--space-xl);
		text-align: center;
	}

	.cta-inner {
		max-width: 600px;
		margin: 0 auto;
	}

	.cta-inner h2 {
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-sm);
	}

	.cta-inner p {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-xl);
	}

	@media (max-width: 768px) {
		h1 {
			font-size: var(--text-3xl);
		}

		.hero-proof {
			flex-direction: column;
			align-items: center;
		}
	}
</style>
