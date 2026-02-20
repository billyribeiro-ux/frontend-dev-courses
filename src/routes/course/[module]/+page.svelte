<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { ArrowRight, CheckCircle, BookOpen, Code } from 'phosphor-svelte';
	import type { UserProgress } from '$lib/types/index.js';

	let { data } = $props();
	const mod = $derived(data.module);

	const completedSet = $derived(
		new Set(
			(data.progress as UserProgress[])
				.filter((p) => p.completed && p.moduleSlug === mod.slug)
				.map((p) => p.lessonSlug)
		)
	);
</script>

<MetaTags
	title="Module {mod.number}: {mod.title} | Svelte 5 Bootcamp"
	description={mod.description}
/>

<div class="module-page">
	<div class="module-header">
		<span class="module-label">Module {mod.number} — Phase {mod.phase}</span>
		<h1>{mod.title}</h1>
		<p>{mod.description}</p>
	</div>

	{#if mod.lessons.length > 0}
		<div class="lessons-list">
			{#each mod.lessons as lesson}
				{@const done = completedSet.has(lesson.slug)}
				<a href="/course/{mod.slug}/{lesson.slug}" class="lesson-item" class:completed={done}>
					<div class="lesson-status">
						{#if done}
							<CheckCircle size={20} weight="fill" />
						{:else}
							<BookOpen size={20} />
						{/if}
					</div>
					<div class="lesson-info">
						<h3>
							{lesson.number}. {lesson.title}
							{#if lesson.hasEditor}
								<Code size={14} class="editor-badge" />
							{/if}
						</h3>
						<p>{lesson.description}</p>
					</div>
					<ArrowRight size={16} />
				</a>
			{/each}
		</div>
	{:else}
		<div class="coming-soon">
			<p>Lesson content for this module is coming soon. Check back later!</p>
		</div>
	{/if}
</div>

<style>
	.module-page {
		max-width: 700px;
	}

	.module-header {
		margin-bottom: var(--space-xl);
	}

	.module-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-brand);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	h1 {
		font-size: var(--text-2xl);
		margin: var(--space-xs) 0;
	}

	.module-header p {
		color: var(--color-text-secondary);
		margin: 0;
	}

	.lessons-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.lesson-item {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition: all var(--transition-fast);
		color: var(--color-text);
	}

	.lesson-item:hover {
		border-color: var(--color-brand);
		background: var(--color-bg-secondary);
	}

	.lesson-item.completed .lesson-status {
		color: var(--color-success);
	}

	.lesson-status {
		color: var(--color-text-muted);
	}

	.lesson-info {
		flex: 1;
	}

	.lesson-info h3 {
		font-size: var(--text-base);
		margin: 0 0 2px;
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.lesson-info h3 :global(.editor-badge) {
		color: var(--color-brand);
	}

	.lesson-info p {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.coming-soon {
		padding: var(--space-2xl);
		text-align: center;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		color: var(--color-text-muted);
	}
</style>
