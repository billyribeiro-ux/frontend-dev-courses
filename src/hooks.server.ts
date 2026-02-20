import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await validateSession(token);
	event.locals.user = user;
	event.locals.session = session;

	return resolve(event);
};
