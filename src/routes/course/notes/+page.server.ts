import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { db } from '$lib/server/db.js';
import { notes } from '$lib/server/schema.js';
import { and, eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const allNotes = db
		.select()
		.from(notes)
		.where(eq(notes.userId, locals.user!.id))
		.orderBy(desc(notes.updatedAt))
		.all();

	return { allNotes };
};

export const actions: Actions = {
	deleteNote: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const noteId = Number(formData.get('noteId'));

		const existing = db
			.select()
			.from(notes)
			.where(and(eq(notes.id, noteId), eq(notes.userId, locals.user.id)))
			.get();
		if (!existing) return fail(404, { error: 'Note not found.' });

		db.delete(notes).where(eq(notes.id, noteId)).run();

		return { deleted: true };
	}
};
