<script lang="ts">
	import { Monitor } from 'phosphor-svelte';

	let { html = '', css: cssCode = '', js = '' }: { html: string; css?: string; js?: string } =
		$props();

	const srcdoc = $derived(`
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body { font-family: system-ui, sans-serif; padding: 16px; color: #1a1a2e; }
		${cssCode}
	</style>
</head>
<body>
	${html}
	<script>${js}<\/script>
</body>
</html>
	`);
</script>

<div class="preview-wrapper">
	<div class="preview-header">
		<Monitor size={14} />
		<span>Preview</span>
	</div>
	<iframe class="preview-frame" title="Live Preview" srcdoc={srcdoc} sandbox="allow-scripts"></iframe>
</div>

<style>
	.preview-wrapper {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-md);
		background: var(--color-bg-tertiary);
		border-bottom: 1px solid var(--color-border);
		font-size: 11px;
		font-weight: 700;
		color: var(--color-text-muted);
		letter-spacing: 0.05em;
	}

	.preview-frame {
		width: 100%;
		min-height: 200px;
		border: none;
		background: white;
	}
</style>
