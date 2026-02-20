import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { db } from '$lib/server/db.js';
import { users } from '$lib/server/schema.js';
import { createSession, verifyPassword, setSessionCookie } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/course');
	}
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const password = formData.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Please enter your email and password.', email });
		}

		const user = db.select().from(users).where(eq(users.email, email)).get();
		if (!user) {
			return fail(400, { error: 'Invalid email or password.', email });
		}

		const validPassword = await verifyPassword(user.hashedPassword, password);
		if (!validPassword) {
			return fail(400, { error: 'Invalid email or password.', email });
		}

		const { token, expiresAt } = await createSession(user.id);
		setSessionCookie(event, token, expiresAt);

		redirect(302, '/course');
	}
};
