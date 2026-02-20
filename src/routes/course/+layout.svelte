<script lang="ts">
	import { page } from '$app/state';
	import { courseModules } from '$lib/content/index.js';
	import { CheckCircle, Circle, CaretRight, House, SignOut } from 'phosphor-svelte';
	import type { UserProgress } from '$lib/types/index.js';

	let { children, data } = $props();

	let sidebarOpen = $state(false);

	const completedLessons = $derived(
		new Set(
			(data.progress as UserProgress[])
				.filter((p) => p.completed)
				.map((p) => `${p.moduleSlug}/${p.lessonSlug}`)
		)
	);

	function isLessonComplete(moduleSlug: string, lessonSlug: string): boolean {
		return completedLessons.has(`${moduleSlug}/${lessonSlug}`);
	}

	function getModuleProgress(moduleSlug: string): number {
		const mod = courseModules.find((m) => m.slug === moduleSlug);
		if (!mod || mod.lessons.length === 0) return 0;
		const completed = mod.lessons.filter((l) => isLessonComplete(moduleSlug, l.slug)).length;
		return Math.round((completed / mod.lessons.length) * 100);
	}

	const phaseNames: Record<number, string> = {
		1: 'Foundations',
		2: 'Intermediate',
		3: 'Full-Stack',
		4: 'Advanced',
		5: 'Capstone'
	};
</script>

<div class="course-layout">
	<aside class="sidebar" class:open={sidebarOpen}>
		<div class="sidebar-header">
			<a href="/" class="back-link">
				<House size={16} />
				Home
			</a>
			<form method="POST" action="/logout">
				<button type="submit" class="logout-btn">
					<SignOut size={16} />
					Logout
				</button>
			</form>
		</div>

		<nav class="sidebar-nav">
			{#each [1, 2, 3, 4, 5] as phase}
				<div class="phase-group">
					<div class="phase-label">Phase {phase}: {phaseNames[phase]}</div>
					{#each courseModules.filter((m) => m.phase === phase) as mod}
						{@const prog = getModuleProgress(mod.slug)}
						<a
							href="/course/{mod.slug}"
							class="module-link"
							class:active={page.url.pathname.includes(mod.slug)}
						>
							<span class="module-num">{mod.number}</span>
							<span class="module-title">{mod.title}</span>
							{#if prog === 100}
								<CheckCircle size={16} weight="fill" class="done" />
							{:else if prog > 0}
								<span class="progress-badge">{prog}%</span>
							{/if}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
	</aside>

	<div class="course-content">
		{@render children()}
	</div>
</div>

<style>
	.course-layout {
		display: flex;
		min-height: calc(100vh - 60px);
	}

	.sidebar {
		width: 280px;
		flex-shrink: 0;
		background: var(--color-bg-secondary);
		border-right: 1px solid var(--color-border);
		overflow-y: auto;
		height: calc(100vh - 60px);
		position: sticky;
		top: 60px;
	}

	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.logout-btn {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.logout-btn:hover {
		color: var(--color-error);
	}

	.sidebar-nav {
		padding: var(--space-sm);
	}

	.phase-group {
		margin-bottom: var(--space-md);
	}

	.phase-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding: var(--space-sm) var(--space-sm);
		margin-bottom: var(--space-xs);
	}

	.module-link {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.module-link:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.module-link.active {
		background: var(--color-brand);
		color: white;
	}

	.module-num {
		font-weight: 600;
		font-size: var(--text-xs);
		min-width: 20px;
	}

	.module-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.module-link :global(.done) {
		color: var(--color-success);
	}

	.module-link.active :global(.done) {
		color: white;
	}

	.progress-badge {
		font-size: 10px;
		background: var(--color-bg-tertiary);
		padding: 1px 6px;
		border-radius: var(--radius-full);
		font-weight: 600;
	}

	.course-content {
		flex: 1;
		padding: var(--space-xl) var(--space-2xl);
		max-width: 900px;
	}

	@media (max-width: 768px) {
		.sidebar {
			display: none;
		}

		.sidebar.open {
			display: block;
			position: fixed;
			z-index: 50;
			top: 0;
			left: 0;
			height: 100vh;
		}

		.course-content {
			padding: var(--space-md);
		}
	}
</style>
