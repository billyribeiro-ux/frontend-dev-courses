import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

export const stripe = new Stripe(STRIPE_SECRET_KEY);

export const COURSE_PRICE_CENTS = 9900; // $99.00
