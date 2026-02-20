import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db.js';
import { progress } from '$lib/server/schema.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userProgress = db
		.select()
		.from(progress)
		.where(eq(progress.userId, locals.user.id))
		.all();

	return json(userProgress);
};
