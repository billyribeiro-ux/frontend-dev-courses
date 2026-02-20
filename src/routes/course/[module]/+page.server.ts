import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { getModule } from '$lib/content/index.js';

export const load: PageServerLoad = async ({ params }) => {
	const mod = getModule(params.module);

	if (!mod) {
		error(404, 'Module not found');
	}

	return { module: mod };
};
