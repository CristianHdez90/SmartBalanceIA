import { sqliteTable, text, integer, real, index, check, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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

export const financialGoals = sqliteTable('financial_goals', {
 id: text('id').primaryKey().notNull(), userId: text('user_id').notNull().references(() => users.id),
 name: text('name').notNull(), target: integer('target').notNull(), saved: integer('saved').notNull().default(0),
 dueDate: text('due_date').notNull(), icon: text('icon').notNull(), color: text('color').notNull(),
 version: integer('version').notNull().default(1), archived: integer('archived').notNull().default(0),
 createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [index('idx_financial_goals_user').on(t.userId, t.archived, t.dueDate),
 check('goal_target_valid', sql`${t.target} > 0 AND ${t.target} <= 999999999999`),
 check('goal_saved_valid', sql`${t.saved} >= 0 AND ${t.saved} <= 999999999999`),
 check('goal_archived_valid', sql`${t.archived} IN (0,1)`)]);

export const balanceTransfers = sqliteTable('balance_transfers', {
 id:text('id').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id),
 fromMonth:text('from_month').notNull(),toMonth:text('to_month').notNull(),amount:integer('amount').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_balance_transfers_from').on(t.userId,t.fromMonth),index('idx_balance_transfers_to').on(t.userId,t.toMonth),check('transfer_amount_valid',sql`${t.amount} > 0 AND ${t.amount} <= 999999999999`),check('transfer_next_month',sql`${t.toMonth} = strftime('%Y-%m',${t.fromMonth} || '-01','+1 month')`)]);

export const obligationCarries=sqliteTable('obligation_carries',{
 id:text('id').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id),sourceId:text('source_id').notNull(),targetId:text('target_id').notNull(),fromMonth:text('from_month').notNull(),toMonth:text('to_month').notNull(),amount:integer('amount').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_obligation_carries_source').on(t.userId,t.sourceId),index('idx_obligation_carries_target').on(t.userId,t.targetId),check('obligation_carry_amount',sql`${t.amount}>0 AND ${t.amount}<=999999999999`),check('obligation_carry_month',sql`${t.toMonth}=strftime('%Y-%m',${t.fromMonth}||'-01','+1 month')`)]);
export const obligationHistory=sqliteTable('obligation_history',{
 id:text('id').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id),obligationId:text('obligation_id').notNull(),month:text('month').notNull(),fromStatus:text('from_status'),toStatus:text('to_status').notNull(),effectiveDate:text('effective_date').notNull(),recordedAt:integer('recorded_at').notNull(),cause:text('cause').notNull(),basis:text('basis').notNull(),
},t=>[index('idx_obligation_history_month').on(t.userId,t.month,t.recordedAt)]);

export const notificationSettings = sqliteTable('notification_settings', {
 userId:text('user_id').primaryKey().notNull().references(()=>users.id),
 payments:integer('payments').notNull().default(1),promotions:integer('promotions').notNull().default(1),
 advanceDays:integer('advance_days').notNull().default(3),time:text('time').notNull().default('08:00'),auxiliaryMinutes:integer('auxiliary_minutes').notNull().default(30),updatedAt:integer('updated_at').notNull(),
},t=>[check('reminder_payments_bool',sql`${t.payments} IN (0,1)`),check('reminder_promotions_bool',sql`${t.promotions} IN (0,1)`),check('reminder_advance_range',sql`${t.advanceDays} BETWEEN 0 AND 14`)]);
export const promotionReminders = sqliteTable('promotion_reminders', {
 id:text('id').notNull(),userId:text('user_id').notNull().references(()=>users.id),supermarket:text('supermarket').notNull(),product:text('product').notNull(),
 weekdays:text('weekdays').notNull(),startDate:text('start_date').notNull(),endDate:text('end_date').notNull(),note:text('note').notNull().default(''),
 enabled:integer('enabled').notNull().default(1),version:integer('version').notNull().default(1),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),index('idx_promotion_reminders_user_dates').on(t.userId,t.startDate,t.endDate),check('reminder_enabled_bool',sql`${t.enabled} IN (0,1)`)]);

export const webPushSubscriptions = sqliteTable('web_push_subscriptions', {
 id:text('id').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 sessionHash:text('session_hash').notNull().references(()=>sessions.idHash,{onDelete:'cascade'}),endpoint:text('endpoint').notNull().unique(),
 p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),lastTestAt:integer('last_test_at').notNull().default(0),
},t=>[index('idx_web_push_user').on(t.userId)]);
export const notificationAuxiliaryChecks = sqliteTable('notification_auxiliary_checks', {
 userId:text('user_id').primaryKey().notNull().references(()=>users.id,{onDelete:'cascade'}),checkedAt:integer('checked_at').notNull(),
});
export const notificationInbox = sqliteTable('notification_inbox', {
 userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),id:text('id').notNull(),day:text('day').notNull(),kind:text('kind').notNull(),
 title:text('title').notNull(),body:text('body').notNull(),section:text('section').notNull(),active:integer('active').notNull().default(1),
 readAt:integer('read_at'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),index('idx_notification_inbox_user').on(t.userId,t.active,t.readAt,t.createdAt)]);
export const webPushDeliveries = sqliteTable('web_push_deliveries', {
 subscriptionId:text('subscription_id').notNull().references(()=>webPushSubscriptions.id,{onDelete:'cascade'}),day:text('day').notNull(),
 state:text('state').notNull(),attempts:integer('attempts').notNull().default(1),retryAt:integer('retry_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.subscriptionId,t.day]})]);
