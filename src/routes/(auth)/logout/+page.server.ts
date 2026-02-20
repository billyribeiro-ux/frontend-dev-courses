import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { invalidateSession, deleteSessionCookie } from '$lib/server/auth.js';

export const actions: Actions = {
	default: async (event) => {
		const token = event.cookies.get('session');
		if (token) {
			await invalidateSession(token);
		}
		deleteSessionCookie(event);
		redirect(302, '/');
	}
};
