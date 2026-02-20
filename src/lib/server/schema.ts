import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	hashedPassword: text('hashed_password').notNull(),
	name: text('name').notNull(),
	hasPaid: integer('has_paid', { mode: 'boolean' }).notNull().default(false),
	stripeCustomerId: text('stripe_customer_id'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const progress = sqliteTable('progress', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	moduleSlug: text('module_slug').notNull(),
	lessonSlug: text('lesson_slug').notNull(),
	completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
	completedAt: text('completed_at')
});

export const payments = sqliteTable('payments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	stripePaymentIntentId: text('stripe_payment_intent_id').notNull(),
	amount: integer('amount').notNull(),
	status: text('status').notNull(),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});
