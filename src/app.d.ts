import type { SessionUser } from '$lib/server/modules/auth/auth.types';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
		}
	}
}

export {};
