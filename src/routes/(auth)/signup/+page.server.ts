import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { db } from '$lib/server/db.js';
import { users } from '$lib/server/schema.js';
import { createSession, hashPassword, setSessionCookie } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/course');
	}
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const password = formData.get('password')?.toString();

		if (!name || name.length < 2) {
			return fail(400, { error: 'Name must be at least 2 characters.', email, name });
		}
		if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.', email, name });
		}
		if (!password || password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.', email, name });
		}

		const existingUser = db.select().from(users).where(eq(users.email, email)).get();
		if (existingUser) {
			return fail(400, { error: 'An account with this email already exists.', email, name });
		}

		const userId = crypto.randomUUID();
		const hashedPassword = await hashPassword(password);

		db.insert(users)
			.values({
				id: userId,
				email,
				name,
				hashedPassword
			})
			.run();

		const { token, expiresAt } = await createSession(userId);
		setSessionCookie(event, token, expiresAt);

		redirect(302, '/course');
	}
};
