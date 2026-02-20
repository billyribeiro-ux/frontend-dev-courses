<script lang="ts">
	import { enhance } from '$app/forms';
	import { PencilSimple, Trash, FloppyDisk, X, ArrowRight } from 'phosphor-svelte';
	import type { Note } from '$lib/types/index.js';

	let {
		note,
		showLessonLink = false,
		moduleTitle = '',
		lessonTitle = ''
	}: {
		note: Note;
		showLessonLink?: boolean;
		moduleTitle?: string;
		lessonTitle?: string;
	} = $props();

	let isEditing = $state(false);
	let editContent = $state('');
	let confirmDelete = $state(false);
	let expanded = $state(false);

	const isLong = $derived(note.content.length > 200);
	const displayContent = $derived(
		isLong && !expanded && !isEditing ? note.content.slice(0, 200) + '...' : note.content
	);

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

	function startEdit() {
		editContent = note.content;
		isEditing = true;
		confirmDelete = false;
	}

	function cancelEdit() {
		isEditing = false;
		editContent = '';
	}

	function handleDeleteClick() {
		if (confirmDelete) return;
		confirmDelete = true;
		setTimeout(() => {
			confirmDelete = false;
		}, 3000);
	}
</script>

<div class="note-card" class:editing={isEditing}>
	{#if showLessonLink && moduleTitle && lessonTitle}
		<div class="note-lesson-info">
			<a href="/course/{note.moduleSlug}/{note.lessonSlug}" class="lesson-link">
				{moduleTitle} &rsaquo; {lessonTitle}
				<ArrowRight size={12} />
			</a>
		</div>
	{/if}

	{#if isEditing}
		<form
			method="POST"
			action="?/updateNote"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						isEditing = false;
						editContent = '';
						await update();
					}
				};
			}}
		>
			<input type="hidden" name="noteId" value={note.id} />
			<textarea name="content" bind:value={editContent} rows="4" class="edit-textarea"></textarea>
			<div class="edit-actions">
				<button type="button" class="btn-cancel" onclick={cancelEdit}>
					<X size={14} />
					Cancel
				</button>
				<button type="submit" class="btn-save" disabled={!editContent.trim()}>
					<FloppyDisk size={14} />
					Save
				</button>
			</div>
		</form>
	{:else}
		<div class="note-body">
			<p class="note-content" class:truncated={isLong && !expanded}>{displayContent}</p>
			{#if isLong}
				<button class="btn-expand" onclick={() => (expanded = !expanded)}>
					{expanded ? 'Show less' : 'Show more'}
				</button>
			{/if}
		</div>
		<div class="note-footer">
			<span class="note-time">{formatDate(note.updatedAt)}</span>
			<div class="note-actions">
				<button class="btn-icon" onclick={startEdit} title="Edit note">
					<PencilSimple size={14} />
				</button>
				{#if confirmDelete}
					<form
						method="POST"
						action="?/deleteNote"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="noteId" value={note.id} />
						<button type="submit" class="btn-icon btn-confirm-delete" title="Confirm delete">
							Confirm?
						</button>
					</form>
				{:else}
					<button class="btn-icon btn-delete" onclick={handleDeleteClick} title="Delete note">
						<Trash size={14} />
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.note-card {
		padding: var(--space-md);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		transition: all var(--transition-fast);
	}

	.note-card:hover {
		border-color: var(--color-border);
	}

	.note-card.editing {
		border-color: var(--color-brand);
		box-shadow: 0 0 0 1px var(--color-brand);
	}

	.note-lesson-info {
		margin-bottom: var(--space-sm);
	}

	.lesson-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-xs);
		color: var(--color-brand);
		font-weight: 500;
	}

	.lesson-link:hover {
		color: var(--color-brand-dark);
	}

	.note-body {
		margin-bottom: var(--space-sm);
	}

	.note-content {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.btn-expand {
		background: none;
		border: none;
		font-size: var(--text-xs);
		color: var(--color-brand);
		cursor: pointer;
		padding: 0;
		margin-top: var(--space-xs);
		font-family: inherit;
		font-weight: 500;
	}

	.btn-expand:hover {
		color: var(--color-brand-dark);
	}

	.note-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.note-time {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.note-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: var(--space-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		font-family: inherit;
		font-size: var(--text-xs);
		transition: all var(--transition-fast);
	}

	.btn-icon:hover {
		color: var(--color-text);
		background: var(--color-bg-tertiary);
	}

	.btn-delete:hover {
		color: var(--color-error);
	}

	.btn-confirm-delete {
		color: var(--color-error);
		font-weight: 600;
		padding: var(--space-xs) var(--space-sm);
		background: #fef2f2;
		border-radius: var(--radius-sm);
	}

	/* Edit mode */
	.edit-textarea {
		width: 100%;
		padding: var(--space-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: var(--text-sm);
		line-height: 1.6;
		resize: vertical;
		min-height: 80px;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.edit-textarea:focus {
		outline: none;
		border-color: var(--color-brand);
		box-shadow: 0 0 0 2px rgba(255, 62, 0, 0.1);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	.btn-cancel {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: none;
		border: 1px solid var(--color-border);
		padding: var(--space-xs) var(--space-md);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.btn-cancel:hover {
		border-color: var(--color-text-muted);
		color: var(--color-text);
	}

	.btn-save {
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

	.btn-save:hover {
		background: var(--color-brand-dark);
	}

	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
