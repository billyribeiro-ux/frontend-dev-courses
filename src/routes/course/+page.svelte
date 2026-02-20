<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { courseModules } from '$lib/content/index.js';
	import { ArrowRight, CheckCircle, BookOpen } from 'phosphor-svelte';
	import type { UserProgress } from '$lib/types/index.js';

	let { data } = $props();

	const completedSet = $derived(
		new Set(
			(data.progress as UserProgress[])
				.filter((p) => p.completed)
				.map((p) => `${p.moduleSlug}/${p.lessonSlug}`)
		)
	);

	const totalLessons = $derived(courseModules.reduce((sum, m) => sum + m.lessons.length, 0));
	const completedCount = $derived(completedSet.size);
	const overallProgress = $derived(totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0);

	const phaseNames: Record<number, string> = {
		1: 'Foundations',
		2: 'Intermediate',
		3: 'Full-Stack',
		4: 'Advanced',
		5: 'Capstone'
	};
</script>

<MetaTags title="Course Dashboard | Svelte 5 Bootcamp" description="Track your progress through the Svelte 5 Bootcamp." />

<div class="dashboard">
	<div class="welcome">
		<h1>Welcome, {data.user?.name}!</h1>
		<p>Your journey through Svelte 5 — {overallProgress}% complete</p>
		<div class="progress-bar">
			<div class="progress-fill" style="width: {overallProgress}%"></div>
		</div>
		<p class="progress-text">{completedCount} of {totalLessons} lessons completed</p>
	</div>

	{#each [1, 2, 3, 4, 5] as phase}
		<section class="phase-section">
			<h2>Phase {phase}: {phaseNames[phase]}</h2>
			<div class="modules-grid">
				{#each courseModules.filter((m) => m.phase === phase) as mod}
					{@const modCompleted = mod.lessons.filter((l) => completedSet.has(`${mod.slug}/${l.slug}`)).length}
					{@const modTotal = mod.lessons.length}
					<a href="/course/{mod.slug}" class="module-card">
						<div class="module-header">
							<span class="module-number">Module {mod.number}</span>
							{#if modTotal > 0 && modCompleted === modTotal}
								<CheckCircle size={18} weight="fill" color="var(--color-success)" />
							{/if}
						</div>
						<h3>{mod.title}</h3>
						<p>{mod.description}</p>
						{#if modTotal > 0}
							<div class="module-footer">
								<BookOpen size={14} />
								<span>{modCompleted}/{modTotal} lessons</span>
								<ArrowRight size={14} />
							</div>
						{:else}
							<div class="module-footer coming-soon">
								<span>Coming soon</span>
							</div>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.dashboard {
		max-width: 800px;
	}

	.welcome {
		margin-bottom: var(--space-2xl);
	}

	.welcome h1 {
		font-size: var(--text-2xl);
		margin: 0 0 var(--space-xs);
	}

	.welcome p {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-md);
	}

	.progress-bar {
		height: 8px;
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-brand);
		border-radius: var(--radius-full);
		transition: width 0.5s ease;
	}

	.progress-text {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: var(--space-xs) 0 0;
	}

	.phase-section {
		margin-bottom: var(--space-2xl);
	}

	.phase-section h2 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-md);
		color: var(--color-text);
	}

	.modules-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-md);
	}

	.module-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		transition: all var(--transition-fast);
		color: var(--color-text);
	}

	.module-card:hover {
		border-color: var(--color-brand);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	.module-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-sm);
	}

	.module-number {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-brand);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.module-card h3 {
		font-size: var(--text-base);
		margin: 0 0 var(--space-xs);
	}

	.module-card p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-md);
		line-height: 1.5;
	}

	.module-footer {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.module-footer.coming-soon {
		font-style: italic;
	}
</style>
