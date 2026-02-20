import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db.js';
import { notes } from '$lib/server/schema.js';
import { eq, desc } from 'drizzle-orm';
import { courseModules } from '$lib/content/index.js';

function getModuleTitle(slug: string): string {
	const mod = courseModules.find((m) => m.slug === slug);
	return mod ? `Module ${mod.number}: ${mod.title}` : slug;
}

function getLessonTitle(moduleSlug: string, lessonSlug: string): string {
	const mod = courseModules.find((m) => m.slug === moduleSlug);
	return mod?.lessons.find((l) => l.slug === lessonSlug)?.title ?? lessonSlug;
}

function formatTimestamp(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

interface NoteRecord {
	id: number;
	userId: string;
	moduleSlug: string;
	lessonSlug: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

function buildMarkdownExport(allNotes: NoteRecord[], userName: string): string {
	const lines: string[] = [];

	lines.push('# Course Notes — Svelte 5 Bootcamp');
	lines.push(`*Exported on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}*`);
	lines.push(`*By: ${userName}*`);
	lines.push('');
	lines.push('---');
	lines.push('');

	// Group by module
	const groups = new Map<string, NoteRecord[]>();
	for (const note of allNotes) {
		if (!groups.has(note.moduleSlug)) groups.set(note.moduleSlug, []);
		groups.get(note.moduleSlug)!.push(note);
	}

	// Sort modules by their number in the course
	const sortedModules = [...groups.entries()].sort((a, b) => {
		const modA = courseModules.find((m) => m.slug === a[0]);
		const modB = courseModules.find((m) => m.slug === b[0]);
		return (modA?.number ?? 0) - (modB?.number ?? 0);
	});

	for (const [moduleSlug, moduleNotes] of sortedModules) {
		lines.push(`## ${getModuleTitle(moduleSlug)}`);
		lines.push('');

		// Group by lesson within module
		const lessonGroups = new Map<string, NoteRecord[]>();
		for (const note of moduleNotes) {
			if (!lessonGroups.has(note.lessonSlug)) lessonGroups.set(note.lessonSlug, []);
			lessonGroups.get(note.lessonSlug)!.push(note);
		}

		for (const [lessonSlug, lessonNotes] of lessonGroups) {
			lines.push(`### ${getLessonTitle(moduleSlug, lessonSlug)}`);
			lines.push('');

			for (const note of lessonNotes) {
				lines.push(`> ${note.content.replace(/\n/g, '\n> ')}`);
				lines.push('');
				lines.push(`*Created: ${formatTimestamp(note.createdAt)}${note.updatedAt !== note.createdAt ? ` | Updated: ${formatTimestamp(note.updatedAt)}` : ''}*`);
				lines.push('');
			}

			lines.push('---');
			lines.push('');
		}
	}

	return lines.join('\n');
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const moduleSlug = url.searchParams.get('module');
	const lessonSlug = url.searchParams.get('lesson');

	let allNotes = db
		.select()
		.from(notes)
		.where(eq(notes.userId, locals.user.id))
		.orderBy(desc(notes.updatedAt))
		.all();

	if (moduleSlug) {
		allNotes = allNotes.filter((n) => n.moduleSlug === moduleSlug);
	}
	if (lessonSlug) {
		allNotes = allNotes.filter((n) => n.lessonSlug === lessonSlug);
	}

	if (allNotes.length === 0) {
		return new Response('No notes to export.', { status: 404 });
	}

	const markdown = buildMarkdownExport(allNotes, locals.user.name);

	const filename = moduleSlug
		? lessonSlug
			? `notes-${moduleSlug}-${lessonSlug}.md`
			: `notes-${moduleSlug}.md`
		: 'course-notes.md';

	return new Response(markdown, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
