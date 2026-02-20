import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types.js';
import { db } from '$lib/server/db.js';
import { progress } from '$lib/server/schema.js';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}
	if (!locals.user.hasPaid) {
		redirect(302, '/pricing');
	}

	const userProgress = db
		.select()
		.from(progress)
		.where(eq(progress.userId, locals.user.id))
		.all();

	return {
		user: locals.user,
		progress: userProgress
	};
};
