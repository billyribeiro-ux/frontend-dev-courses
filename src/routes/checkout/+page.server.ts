import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { stripe, COURSE_PRICE_CENTS } from '$lib/server/stripe.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}
	if (locals.user.hasPaid) {
		redirect(302, '/course');
	}

	const paymentIntent = await stripe.paymentIntents.create({
		amount: COURSE_PRICE_CENTS,
		currency: 'usd',
		metadata: {
			userId: locals.user.id
		}
	});

	return {
		clientSecret: paymentIntent.client_secret
	};
};
