import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { getModule } from '$lib/content/index.js';
import { db } from '$lib/server/db.js';
import { progress, notes } from '$lib/server/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { loadLessonContent, loadExercises } from '$lib/server/markdown.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const mod = getModule(params.module);
	if (!mod) error(404, 'Module not found');

	const lesson = mod.lessons.find((l) => l.slug === params.lesson);
	if (!lesson) error(404, 'Lesson not found');

	const userProgress = locals.user
		? db
				.select()
				.from(progress)
				.where(
					and(
						eq(progress.userId, locals.user.id),
						eq(progress.moduleSlug, params.module),
						eq(progress.lessonSlug, params.lesson)
					)
				)
				.get()
		: null;

	// Fetch user's notes for this lesson
	const userNotes = locals.user
		? db
				.select()
				.from(notes)
				.where(
					and(
						eq(notes.userId, locals.user.id),
						eq(notes.moduleSlug, params.module),
						eq(notes.lessonSlug, params.lesson)
					)
				)
				.orderBy(desc(notes.createdAt))
				.all()
		: [];

	// Find next lesson
	const currentIndex = mod.lessons.findIndex((l) => l.slug === params.lesson);
	const nextLesson = mod.lessons[currentIndex + 1] ?? null;

	// Load markdown content
	const content = loadLessonContent(params.module, params.lesson);

	// Load exercises for editor-enabled lessons
	const exercises = lesson.hasEditor ? loadExercises(params.module) : [];

	return {
		module: mod,
		lesson,
		content,
		exercises,
		isCompleted: userProgress?.completed ?? false,
		nextLesson,
		notes: userNotes
	};
};

export const actions: Actions = {
	complete: async ({ params, locals }) => {
		if (!locals.user) return;

		const existing = db
			.select()
			.from(progress)
			.where(
				and(
					eq(progress.userId, locals.user.id),
					eq(progress.moduleSlug, params.module),
					eq(progress.lessonSlug, params.lesson)
				)
			)
			.get();

		if (existing) {
			db.update(progress)
				.set({ completed: true, completedAt: new Date().toISOString() })
				.where(eq(progress.id, existing.id))
				.run();
		} else {
			db.insert(progress)
				.values({
					userId: locals.user.id,
					moduleSlug: params.module,
					lessonSlug: params.lesson,
					completed: true,
					completedAt: new Date().toISOString()
				})
				.run();
		}

		return { completed: true };
	},

	createNote: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { noteError: 'Unauthorized' });

		const formData = await request.formData();
		const content = formData.get('content')?.toString().trim();

		if (!content) return fail(400, { noteError: 'Note cannot be empty.' });

		db.insert(notes)
			.values({
				userId: locals.user.id,
				moduleSlug: params.module,
				lessonSlug: params.lesson,
				content
			})
			.run();

		return { noteSuccess: true };
	},

	updateNote: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { noteError: 'Unauthorized' });

		const formData = await request.formData();
		const noteId = Number(formData.get('noteId'));
		const content = formData.get('content')?.toString().trim();

		if (!content) return fail(400, { noteError: 'Note cannot be empty.' });

		const existing = db
			.select()
			.from(notes)
			.where(and(eq(notes.id, noteId), eq(notes.userId, locals.user.id)))
			.get();
		if (!existing) return fail(404, { noteError: 'Note not found.' });

		db.update(notes)
			.set({ content, updatedAt: new Date().toISOString() })
			.where(eq(notes.id, noteId))
			.run();

		return { noteSuccess: true };
	},

	deleteNote: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { noteError: 'Unauthorized' });

		const formData = await request.formData();
		const noteId = Number(formData.get('noteId'));

		const existing = db
			.select()
			.from(notes)
			.where(and(eq(notes.id, noteId), eq(notes.userId, locals.user.id)))
			.get();
		if (!existing) return fail(404, { noteError: 'Note not found.' });

		db.delete(notes).where(eq(notes.id, noteId)).run();

		return { noteDeleted: true };
	}
};
