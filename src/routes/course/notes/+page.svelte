<script lang="ts">
	import MetaTags from '$lib/components/seo/MetaTags.svelte';
	import { enhance } from '$app/forms';
	import { courseModules } from '$lib/content/index.js';
	import {
		Notebook,
		MagnifyingGlass,
		DownloadSimple,
		Trash,
		ArrowRight,
		PencilSimple,
		Funnel
	} from 'phosphor-svelte';

	let { data } = $props();

	let searchQuery = $state('');
	let filterModule = $state('all');
	let confirmDeleteId = $state<number | null>(null);

	const filteredNotes = $derived(
		data.allNotes.filter((note: { content: string; moduleSlug: string }) => {
			const matchesSearch =
				!searchQuery || note.content.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesModule = filterModule === 'all' || note.moduleSlug === filterModule;
			return matchesSearch && matchesModule;
		})
	);

	// Group notes by module
	const groupedNotes = $derived.by(() => {
		const groups: Map<string, typeof data.allNotes> = new Map();
		for (const note of filteredNotes) {
			const key = note.moduleSlug;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(note);
		}
		return groups;
	});

	// Get unique modules that have notes (for filter dropdown)
	const modulesWithNotes = $derived(
		[...new Set(data.allNotes.map((n: { moduleSlug: string }) => n.moduleSlug))].map(
			(slug) => ({
				slug,
				title: getModuleTitle(slug as string)
			})
		)
	);

	function getModuleTitle(slug: string): string {
		const mod = courseModules.find((m) => m.slug === slug);
		return mod ? `Module ${mod.number}: ${mod.title}` : slug;
	}

	function getModuleNumber(slug: string): number {
		return courseModules.find((m) => m.slug === slug)?.number ?? 0;
	}

	function getLessonTitle(moduleSlug: string, lessonSlug: string): string {
		const mod = courseModules.find((m) => m.slug === moduleSlug);
		return mod?.lessons.find((l) => l.slug === lessonSlug)?.title ?? lessonSlug;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function handleDeleteClick(noteId: number) {
		if (confirmDeleteId === noteId) return;
		confirmDeleteId = noteId;
		setTimeout(() => {
			confirmDeleteId = null;
		}, 3000);
	}
</script>

<MetaTags
	title="My Notes | Svelte 5 Bootcamp"
	description="View and manage all your course notes."
/>

<div class="notes-page">
	<div class="page-header">
		<div class="header-left">
			<h1>
				<Notebook size={28} />
				My Notes
			</h1>
			{#if data.allNotes.length > 0}
				<span class="total-count">{data.allNotes.length} note{data.allNotes.length !== 1 ? 's' : ''}</span>
			{/if}
		</div>
		{#if data.allNotes.length > 0}
			<a href="/api/notes/download?format=markdown" class="btn-download">
				<DownloadSimple size={16} />
				Download All
			</a>
		{/if}
	</div>

	{#if data.allNotes.length > 0}
		<div class="toolbar">
			<div class="search-wrapper">
				<MagnifyingGlass size={16} />
				<input
					type="text"
					placeholder="Search notes..."
					bind:value={searchQuery}
					class="search-input"
				/>
			</div>
			<div class="filter-wrapper">
				<Funnel size={16} />
				<select bind:value={filterModule} class="filter-select">
					<option value="all">All Modules</option>
					{#each modulesWithNotes as mod}
						<option value={mod.slug}>{mod.title}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if filteredNotes.length > 0}
			{#each [...groupedNotes.entries()].sort((a, b) => getModuleNumber(a[0]) - getModuleNumber(b[0])) as [moduleSlug, moduleNotes]}
				<div class="module-group">
					<h2 class="module-group-title">{getModuleTitle(moduleSlug)}</h2>
					<div class="module-notes">
						{#each moduleNotes as note (note.id)}
							<div class="all-note-card">
								<div class="note-meta">
									<a
										href="/course/{note.moduleSlug}/{note.lessonSlug}"
										class="lesson-link"
									>
										{getLessonTitle(note.moduleSlug, note.lessonSlug)}
										<ArrowRight size={12} />
									</a>
									<span class="note-time">{formatDate(note.updatedAt)}</span>
								</div>
								<p class="note-text">{note.content}</p>
								<div class="note-actions">
									<a
										href="/course/{note.moduleSlug}/{note.lessonSlug}"
										class="btn-goto"
										title="Go to lesson"
									>
										<PencilSimple size={14} />
										Edit in lesson
									</a>
									{#if confirmDeleteId === note.id}
										<form
											method="POST"
											action="?/deleteNote"
											use:enhance={() => {
												return async ({ update }) => {
													confirmDeleteId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="noteId" value={note.id} />
											<button type="submit" class="btn-confirm-delete">
												Confirm?
											</button>
										</form>
									{:else}
										<button
											class="btn-delete"
											onclick={() => handleDeleteClick(note.id)}
											title="Delete note"
										>
											<Trash size={14} />
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<MagnifyingGlass size={32} />
				<p>No notes match your search.</p>
			</div>
		{/if}
	{:else}
		<div class="empty-state">
			<Notebook size={48} />
			<h2>No notes yet</h2>
			<p>Start taking notes on your lessons to see them here.</p>
			<a href="/course" class="btn-go-course">
				Go to Course
				<ArrowRight size={16} />
			</a>
		</div>
	{/if}
</div>

<style>
	.notes-page {
		max-width: 800px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--space-xl);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.page-header h1 {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: var(--text-2xl);
		margin: 0;
	}

	.total-count {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.btn-download {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: all var(--transition-fast);
	}

	.btn-download:hover {
		border-color: var(--color-brand);
		color: var(--color-brand);
		background: var(--color-bg);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}

	.search-wrapper {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		transition: border-color var(--transition-fast);
	}

	.search-wrapper:focus-within {
		border-color: var(--color-brand);
		box-shadow: 0 0 0 2px rgba(255, 62, 0, 0.1);
	}

	.search-wrapper :global(svg) {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		border: none;
		background: none;
		font-family: inherit;
		font-size: var(--text-sm);
		color: var(--color-text);
		outline: none;
	}

	.search-input::placeholder {
		color: var(--color-text-muted);
	}

	.filter-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
	}

	.filter-wrapper :global(svg) {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.filter-select {
		border: none;
		background: none;
		font-family: inherit;
		font-size: var(--text-sm);
		color: var(--color-text);
		outline: none;
		cursor: pointer;
	}

	/* Module groups */
	.module-group {
		margin-bottom: var(--space-xl);
	}

	.module-group-title {
		font-size: var(--text-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border-light);
		margin: 0 0 var(--space-md);
	}

	.module-notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	/* Note cards for All Notes page */
	.all-note-card {
		padding: var(--space-md) var(--space-lg);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		background: var(--color-bg);
		transition: all var(--transition-fast);
	}

	.all-note-card:hover {
		border-color: var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.note-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-sm);
	}

	.lesson-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-brand);
	}

	.lesson-link:hover {
		color: var(--color-brand-dark);
	}

	.note-time {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.note-text {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-sm);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.note-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-sm);
	}

	.btn-goto {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.btn-goto:hover {
		color: var(--color-brand);
		background: var(--color-bg-secondary);
	}

	.btn-delete {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: var(--space-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-delete:hover {
		color: var(--color-error);
		background: var(--color-bg-secondary);
	}

	.btn-confirm-delete {
		display: inline-flex;
		align-items: center;
		background: none;
		border: none;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-error);
		background: #fef2f2;
		cursor: pointer;
		font-family: inherit;
	}

	/* Empty states */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-3xl) var(--space-xl);
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty-state h2 {
		font-size: var(--text-lg);
		color: var(--color-text);
		margin: var(--space-md) 0 var(--space-xs);
	}

	.empty-state p {
		font-size: var(--text-sm);
		margin: 0 0 var(--space-lg);
	}

	.btn-go-course {
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

	.btn-go-course:hover {
		background: var(--color-brand-dark);
		color: white;
	}

	@media (max-width: 768px) {
		.toolbar {
			flex-direction: column;
		}

		.page-header {
			flex-direction: column;
			gap: var(--space-md);
		}

		.note-meta {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-xs);
		}
	}
</style>
