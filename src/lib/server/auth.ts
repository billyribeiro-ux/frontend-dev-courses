import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db } from './db.js';
import { sessions, users } from './schema.js';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashSessionToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const sessionId = hashSessionToken(token);
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	db.insert(sessions)
		.values({
			id: sessionId,
			userId,
			expiresAt
		})
		.run();

	return { token, expiresAt };
}

export async function validateSession(token: string) {
	const sessionId = hashSessionToken(token);

	const result = db
		.select({
			session: sessions,
			user: {
				id: users.id,
				email: users.email,
				name: users.name,
				hasPaid: users.hasPaid
			}
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.get();

	if (!result) {
		return { session: null, user: null };
	}

	const { session, user } = result;

	// Check if session has expired
	if (Date.now() >= session.expiresAt.getTime()) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	// Extend session if it's more than 15 days old
	if (Date.now() >= session.expiresAt.getTime() - 15 * 24 * 60 * 60 * 1000) {
		const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		db.update(sessions)
			.set({ expiresAt: newExpiresAt })
			.where(eq(sessions.id, sessionId))
			.run();
		session.expiresAt = newExpiresAt;
	}

	return { session, user };
}

export async function invalidateSession(token: string): Promise<void> {
	const sessionId = hashSessionToken(token);
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function setSessionCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/'
	});
}

export function deleteSessionCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/'
	});
}

export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const saltHex = encodeHexLowerCase(salt);
	const hash = encodeHexLowerCase(sha256(encoder.encode(saltHex + password)));
	return `${saltHex}:${hash}`;
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
	const [salt, hash] = storedHash.split(':');
	const encoder = new TextEncoder();
	const computedHash = encodeHexLowerCase(sha256(encoder.encode(salt + password)));
	return computedHash === hash;
}
