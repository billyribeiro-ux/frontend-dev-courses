import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: './src/lib/server/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: './local.db'
	}
});
