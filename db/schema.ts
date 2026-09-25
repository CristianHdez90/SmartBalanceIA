import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
export const coachTurns = sqliteTable('coach_turns', {
 userId:text('user_id').notNull().default('legacy'),
 id:text('id').primaryKey(), conversationId:text('conversation_id').notNull(), month:text('month').notNull(),
 includeContext:integer('include_context').notNull(), question:text('question').notNull(), answer:text('answer'),
 status:text('status').notNull(), createdAt:integer('created_at').notNull(),
},t=>[index('idx_coach_conversation').on(t.conversationId,t.createdAt),index('idx_coach_month_context').on(t.month,t.includeContext,t.createdAt),index('idx_coach_usage').on(t.createdAt)]);
export const obligations = sqliteTable('obligations', {
 userId:text('user_id').notNull().default('legacy'),
 recurringAmount:integer('recurring_amount'),
 seriesId:text('series_id'), cutoffDay:integer('cutoff_day'), dueDay:integer('due_day'), totalDebt:integer('total_debt'), bank:text('bank').notNull().default(''), bankingUrl:text('banking_url').notNull().default(''), interestMV:real('interest_mv'), interestEA:real('interest_ea'),
 cutoffDate: text('cutoff_date'), dueDate: text('due_date'),
 id: text('id').primaryKey(), month: text('month').notNull(), name: text('name').notNull(), category: text('category').notNull(), amount: integer('amount'), note: text('note').notNull().default(''),
}, t => [index('idx_obligations_month').on(t.month)]);
export const movements = sqliteTable('movements', {
 userId:text('user_id').notNull().default('legacy'),
 id: text('id').primaryKey(), month: text('month').notNull(), kind: text('kind').notNull(), obligationId: text('obligation_id').references(() => obligations.id), amount: integer('amount').notNull(), date: text('date'), description: text('description').notNull(),
}, t => [index('idx_movements_month').on(t.month), index('idx_movements_obligation').on(t.obligationId)]);
export const dailyExpenses = sqliteTable('daily_expenses', {
 userId:text('user_id').notNull().default('legacy'),
 id:text('id').primaryKey(), month:text('month').notNull(), category:text('category').notNull(), amount:integer('amount').notNull(), date:text('date').notNull(), description:text('description').notNull(),
},t=>[index('idx_daily_expenses_month_date').on(t.month,t.date),index('idx_daily_expenses_category').on(t.category)]);
export const promotionCache = sqliteTable('promotion_cache', {
 cacheKey:text('cache_key').primaryKey(),cacheDate:text('cache_date').notNull(),payload:text('payload').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_promotion_cache_date').on(t.cacheDate)]);

// Anonymous attempt counters survive history deletion to preserve the daily limit.
export const coachUsage=sqliteTable('coach_usage',{id:text('id').primaryKey(),userId:text('user_id').notNull().default('legacy'),createdAt:integer('created_at').notNull()},t=>[index('idx_coach_usage_time').on(t.createdAt)]);

export const users=sqliteTable('users',{
 id:text('id').primaryKey(),email:text('email').notNull().unique(),displayName:text('display_name').notNull(),passwordHash:text('password_hash').notNull(),passwordSalt:text('password_salt').notNull(),firebaseUid:text('firebase_uid').unique(),role:text('role').notNull().default('user'),status:text('status').notNull().default('pending'),createdAt:integer('created_at').notNull(),emailVerifiedAt:integer('email_verified_at'),approvedAt:integer('approved_at'),approvedBy:text('approved_by'),
},t=>[index('idx_users_status').on(t.status),index('idx_users_email').on(t.email),index('idx_users_firebase_uid').on(t.firebaseUid)]);
export const emailVerifications=sqliteTable('email_verifications',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),tokenHash:text('token_hash').notNull(),status:text('status').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),verifiedBy:text('verified_by'),
},t=>[index('idx_email_verification_user_status').on(t.userId,t.status),index('idx_email_verification_expiry').on(t.expiresAt)]);
export const sessions=sqliteTable('sessions',{
 idHash:text('id_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_sessions_user').on(t.userId),index('idx_sessions_expiry').on(t.expiresAt)]);
export const passwordResetRequests=sqliteTable('password_reset_requests',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),tokenHash:text('token_hash'),status:text('status').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at'),approvedBy:text('approved_by'),
},t=>[index('idx_reset_user_status').on(t.userId,t.status),index('idx_reset_created').on(t.createdAt)]);
export const authEvents=sqliteTable('auth_events',{
 id:text('id').primaryKey(),eventKey:text('event_key').notNull(),kind:text('kind').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_auth_events_key_time').on(t.eventKey,t.createdAt)]);
