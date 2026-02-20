import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
	if (!_stripe) {
		const key = env.STRIPE_SECRET_KEY;
		if (!key) throw new Error('STRIPE_SECRET_KEY is not set — add it to your .env file');
		_stripe = new Stripe(key);
	}
	return _stripe;
}

export const COURSE_PRICE_CENTS = 9900; // $99.00
