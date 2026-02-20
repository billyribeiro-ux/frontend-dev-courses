<script lang="ts">
	import { enhance } from '$app/forms';
	import { FloppyDisk } from 'phosphor-svelte';

	let content = $state('');
</script>

<div class="note-composer">
	<form
		method="POST"
		action="?/createNote"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					content = '';
					await update();
				}
			};
		}}
	>
		<textarea
			name="content"
			bind:value={content}
			placeholder="Write a note about this lesson..."
			rows="3"
		></textarea>
		<div class="composer-actions">
			<span class="char-hint">{content.length} characters</span>
			<button type="submit" class="btn-save-note" disabled={!content.trim()}>
				<FloppyDisk size={14} />
				Save Note
			</button>
		</div>
	</form>
</div>

<style>
	.note-composer {
		border-bottom: 1px solid var(--color-border);
	}

	textarea {
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		border: none;
		font-family: inherit;
		font-size: var(--text-sm);
		line-height: 1.6;
		resize: vertical;
		min-height: 80px;
		background: var(--color-bg);
		color: var(--color-text);
	}

	textarea:focus {
		outline: none;
	}

	textarea::placeholder {
		color: var(--color-text-muted);
	}

	.composer-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-lg);
		background: var(--color-bg-secondary);
		border-top: 1px solid var(--color-border-light);
	}

	.char-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.btn-save-note {
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

	.btn-save-note:hover {
		background: var(--color-brand-dark);
	}

	.btn-save-note:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
