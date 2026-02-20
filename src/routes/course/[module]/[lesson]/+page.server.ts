import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { getModule } from '$lib/content/index.js';
import { db } from '$lib/server/db.js';
import { progress } from '$lib/server/schema.js';
import { and, eq } from 'drizzle-orm';

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

	// Find next lesson
	const currentIndex = mod.lessons.findIndex((l) => l.slug === params.lesson);
	const nextLesson = mod.lessons[currentIndex + 1] ?? null;

	return {
		module: mod,
		lesson,
		isCompleted: userProgress?.completed ?? false,
		nextLesson
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
	}
};
