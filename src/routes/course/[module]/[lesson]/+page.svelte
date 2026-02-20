<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { enhance } from '$app/forms';
	import { CheckCircle, ArrowRight, ArrowLeft, Play } from 'phosphor-svelte';

	let { data } = $props();

	let localCompleted = $state(false);
	const completed = $derived(data.isCompleted || localCompleted);

	// Editor state for interactive lessons
	const editorLanguage = $derived((data.exercises?.[0]?.language ?? 'html') as 'html' | 'css' | 'javascript' | 'svelte');
	const starterCode = $derived(data.exercises?.[0]?.starterCode ?? '');
	let editorCode = $state('');
	let showEditor = $state(false);

	$effect(() => {
		editorCode = starterCode;
	});
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

	<!-- Lesson content from markdown -->
	{#if data.content}
		<div class="lesson-content prose">
			{@html data.content}
		</div>
	{:else}
		<div class="lesson-content">
			<div class="content-placeholder">
				<p>Lesson content is being prepared.</p>
				<p>This lesson covers: <strong>{data.lesson.description}</strong></p>
			</div>
		</div>
	{/if}

	<!-- Code Editor for interactive lessons -->
	{#if data.lesson.hasEditor && data.exercises.length > 0}
		<div class="editor-section">
			<div class="editor-header">
				<h2>Try It Yourself</h2>
				<button class="btn-toggle-editor" onclick={() => showEditor = !showEditor}>
					<Play size={16} />
					{showEditor ? 'Hide Editor' : 'Open Editor'}
				</button>
			</div>
			{#if showEditor}
				{#await import('$lib/components/editor/CodeEditor.svelte') then { default: CodeEditor }}
					{#await import('$lib/components/editor/LivePreview.svelte') then { default: LivePreview }}
						<div class="editor-layout">
							<div class="editor-pane">
								<CodeEditor bind:code={editorCode} language={editorLanguage} />
							</div>
							<div class="preview-pane">
								<LivePreview html={editorCode} />
							</div>
						</div>
					{/await}
				{/await}
			{/if}
		</div>
	{/if}

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
		max-width: 800px;
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

	/* Editor section */
	.editor-section {
		margin-bottom: var(--space-2xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) var(--space-lg);
		background: var(--color-bg-secondary);
		border-bottom: 1px solid var(--color-border);
	}

	.editor-header h2 {
		font-size: var(--text-base);
		margin: 0;
	}

	.btn-toggle-editor {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: var(--color-brand);
		color: white;
		border: none;
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.btn-toggle-editor:hover {
		background: var(--color-brand-dark);
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 350px;
	}

	.editor-pane {
		border-right: 1px solid var(--color-border);
		overflow: auto;
	}

	.preview-pane {
		overflow: auto;
	}

	@media (max-width: 768px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}

		.editor-pane {
			border-right: none;
			border-bottom: 1px solid var(--color-border);
		}
	}

	/* Footer */
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
