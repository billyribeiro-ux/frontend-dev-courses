import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getStripe } from '$lib/server/stripe.js';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db.js';
import { users, payments } from '$lib/server/schema.js';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		return json({ error: 'Missing signature' }, { status: 400 });
	}

	let event;
	try {
		const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
		if (!webhookSecret) return json({ error: 'Webhook secret not configured' }, { status: 500 });
		event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
	} catch (err) {
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	if (event.type === 'payment_intent.succeeded') {
		const paymentIntent = event.data.object;
		const userId = paymentIntent.metadata.userId;

		if (userId) {
			db.insert(payments)
				.values({
					userId,
					stripePaymentIntentId: paymentIntent.id,
					amount: paymentIntent.amount,
					status: 'succeeded'
				})
				.run();

			db.update(users).set({ hasPaid: true }).where(eq(users.id, userId)).run();
		}
	}

	return json({ received: true });
};
