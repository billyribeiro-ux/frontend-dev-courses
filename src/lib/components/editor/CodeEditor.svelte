<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { javascript } from '@codemirror/lang-javascript';
	import { html } from '@codemirror/lang-html';
	import { css } from '@codemirror/lang-css';
	import { oneDark } from '@codemirror/theme-one-dark';
	import {
		syntaxHighlighting,
		defaultHighlightStyle,
		bracketMatching
	} from '@codemirror/language';
	import { closeBrackets } from '@codemirror/autocomplete';

	let {
		code = $bindable(''),
		language = 'html',
		theme = 'dark',
		readonly = false
	}: {
		code: string;
		language: 'html' | 'css' | 'javascript' | 'svelte';
		theme?: 'light' | 'dark';
		readonly?: boolean;
	} = $props();

	let editorContainer = $state<HTMLElement | null>(null);
	let view: EditorView | null = null;

	function getLanguageExtension(lang: string) {
		switch (lang) {
			case 'css':
				return css();
			case 'javascript':
				return javascript({ typescript: false });
			case 'svelte':
				return html();
			default:
				return html();
		}
	}

	onMount(() => {
		if (!editorContainer) return;

		const extensions = [
			lineNumbers(),
			highlightActiveLine(),
			history(),
			bracketMatching(),
			closeBrackets(),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			getLanguageExtension(language),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					code = update.state.doc.toString();
				}
			})
		];

		if (theme === 'dark') extensions.push(oneDark);
		if (readonly) extensions.push(EditorState.readOnly.of(true));

		view = new EditorView({
			state: EditorState.create({
				doc: code,
				extensions
			}),
			parent: editorContainer
		});

		return () => view?.destroy();
	});
</script>

<div class="editor-wrapper" class:dark={theme === 'dark'}>
	<div class="editor-header">
		<span class="language-label">{language.toUpperCase()}</span>
	</div>
	<div class="editor-container" bind:this={editorContainer}></div>
</div>

<style>
	.editor-wrapper {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.editor-wrapper.dark {
		border-color: #333;
	}

	.editor-header {
		display: flex;
		align-items: center;
		padding: var(--space-xs) var(--space-md);
		background: var(--color-bg-tertiary);
		border-bottom: 1px solid var(--color-border);
	}

	.dark .editor-header {
		background: #1e1e2e;
		border-color: #333;
	}

	.language-label {
		font-size: 11px;
		font-weight: 700;
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		letter-spacing: 0.05em;
	}

	.editor-container {
		min-height: 200px;
	}

	.editor-container :global(.cm-editor) {
		height: 100%;
		min-height: 200px;
	}

	.editor-container :global(.cm-scroller) {
		font-family: var(--font-mono);
		font-size: 14px;
		line-height: 1.6;
	}
</style>
