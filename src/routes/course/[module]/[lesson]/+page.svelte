<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { enhance } from '$app/forms';
	import { CheckCircle, ArrowRight, ArrowLeft } from 'phosphor-svelte';

	let { data } = $props();

	let localCompleted = $state(false);
	const completed = $derived(data.isCompleted || localCompleted);
</script>

<MetaTags
	title="{data.lesson.title} | Module {data.module.number} | Svelte 5 Bootcamp"
	description={data.lesson.description}
/>

<div class="lesson-page">
	<div class="lesson-header">
		<a href="/course/{data.module.slug}" class="back-link">
			<ArrowLeft size={14} />
			Module {data.module.number}: {data.module.title}
		</a>
		<span class="lesson-label">
			Lesson {data.lesson.number} of {data.module.lessons.length}
		</span>
	</div>

	<h1>{data.lesson.title}</h1>
	<p class="lesson-description">{data.lesson.description}</p>

	<!-- Lesson content area - will be populated with markdown content -->
	<div class="lesson-content">
		<div class="content-placeholder">
			<p>Lesson content will be rendered here from markdown files.</p>
			<p>This lesson teaches: <strong>{data.lesson.description}</strong></p>
		</div>
	</div>

	<!-- Completion & Navigation -->
	<div class="lesson-footer">
		{#if !completed}
			<form method="POST" action="?/complete" use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') localCompleted = true;
				};
			}}>
				<button type="submit" class="btn-complete">
					<CheckCircle size={18} />
					Mark as Complete
				</button>
			</form>
		{:else}
			<div class="completed-badge">
				<CheckCircle size={18} weight="fill" />
				Completed
			</div>
		{/if}

		{#if data.nextLesson}
			<a href="/course/{data.module.slug}/{data.nextLesson.slug}" class="btn-next">
				Next: {data.nextLesson.title}
				<ArrowRight size={16} />
			</a>
		{:else}
			<a href="/course" class="btn-next">
				Back to Dashboard
				<ArrowRight size={16} />
			</a>
		{/if}
	</div>
</div>

<style>
	.lesson-page {
		max-width: 750px;
	}

	.lesson-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-lg);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.back-link:hover {
		color: var(--color-brand);
	}

	.lesson-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	h1 {
		font-size: var(--text-2xl);
		margin: 0 0 var(--space-sm);
	}

	.lesson-description {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-xl);
	}

	.lesson-content {
		margin-bottom: var(--space-2xl);
	}

	.content-placeholder {
		padding: var(--space-2xl);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		text-align: center;
		color: var(--color-text-muted);
	}

	.lesson-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: var(--space-xl);
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
		gap: var(--space-md);
	}

	.btn-complete {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		background: var(--color-success);
		color: white;
		border: none;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.btn-complete:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.completed-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-success);
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.btn-next {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		background: var(--color-brand);
		color: white;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		transition: all var(--transition-fast);
	}

	.btn-next:hover {
		background: var(--color-brand-dark);
		color: white;
	}
</style>
