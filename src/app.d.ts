declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				email: string;
				name: string;
				hasPaid: boolean;
			} | null;
			session: {
				id: string;
				expiresAt: Date;
			} | null;
		}
	}
}

export {};
