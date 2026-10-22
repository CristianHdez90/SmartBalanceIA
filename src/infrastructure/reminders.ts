import type { DatabaseClient } from './database';
import { todayNotifications } from '../domain/notification-inbox';
import { dateForDay } from '../domain/finance';
import { addDays, bogotaDay, buildReminderPlan, defaultReminderSettings, ReminderConflict, type ReminderCommand, type ReminderSettings, type PromotionReminder } from '../domain/reminders';

export class RemindersRepository {
  constructor(private readonly db: DatabaseClient, private readonly userId: string) {}
  async read(now = Date.now()) {
    const row = await this.db.prepare('SELECT repeat_seconds AS repeatSeconds,payments,promotions,advance_days AS advanceDays,time,auxiliary_minutes AS auxiliaryMinutes FROM notification_settings WHERE user_id=?').bind(this.userId).first<ReminderSettings>();
    const settings = row ? { ...row, payments: !!row.payments, promotions: !!row.promotions } : defaultReminderSettings;
    const rows = (await this.db.prepare('SELECT id,supermarket,website,city,address,phone,product,weekdays,start_date AS startDate,end_date AS endDate,note,enabled,version FROM promotion_reminders WHERE user_id=? ORDER BY enabled DESC,end_date,supermarket,id').bind(this.userId).all<Omit<PromotionReminder, 'weekdays'> & { weekdays: string }>()).results;
    const promotions = rows.map(p => ({ ...p, enabled: !!p.enabled, weekdays: JSON.parse(p.weekdays) as number[] }));
    const until = addDays(bogotaDay(now), 44);
    const pending = (await this.db.prepare(`SELECT o.id,o.name,o.note,o.month,o.due_date AS dueDate,o.due_day AS dueDay,
      CASE WHEN o.amount IS NULL THEN NULL ELSE o.amount
        + COALESCE((SELECT SUM(amount) FROM obligation_carries WHERE user_id=o.user_id AND target_id=o.id),0)
        - COALESCE((SELECT SUM(amount) FROM obligation_carries WHERE user_id=o.user_id AND source_id=o.id),0)
        - COALESCE((SELECT SUM(amount) FROM movements WHERE user_id=o.user_id AND obligation_id=o.id AND kind='payment'),0) END AS pending
      FROM obligations o WHERE o.user_id=? AND o.month<=?`).bind(this.userId, until.slice(0, 7)).all<{id:string;name:string;note:string;month:string;dueDate:string|null;dueDay:number|null;pending:number|null}>()).results
      .map(o => ({ ...o, dueDate: o.dueDay !== null ? dateForDay(o.month, o.dueDay) : o.dueDate }));
    return { settings, promotions, todayNotifications:todayNotifications(settings,promotions,pending,now), plan: buildReminderPlan(settings, promotions, pending, now), until: addDays(bogotaDay(now), 29) };
  }
  async execute(command: ReminderCommand) {
    if (command.action === 'settings') {
      const s = command.settings;
      await this.db.prepare('INSERT INTO notification_settings(user_id,payments,promotions,advance_days,time,auxiliary_minutes,repeat_seconds,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET payments=excluded.payments,promotions=excluded.promotions,advance_days=excluded.advance_days,time=excluded.time,auxiliary_minutes=excluded.auxiliary_minutes,repeat_seconds=excluded.repeat_seconds,updated_at=excluded.updated_at').bind(this.userId, Number(s.payments), Number(s.promotions), s.advanceDays, s.time, s.auxiliaryMinutes, s.repeatSeconds, Date.now()).run();
    } else {
      let result;
      if (command.action === 'delete') result = await this.db.prepare('DELETE FROM promotion_reminders WHERE user_id=? AND id=? AND version=?').bind(this.userId, command.id, command.version).run();
      else {
        const p = command;
        if (p.version === 0) {
          result = await this.db.prepare('INSERT OR IGNORE INTO promotion_reminders(user_id,id,supermarket,product,weekdays,start_date,end_date,note,enabled,updated_at,website,city,address,phone) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM promotion_reminders WHERE user_id=?)<100').bind(this.userId,p.id,p.supermarket,p.product,JSON.stringify(p.weekdays),p.startDate,p.endDate,p.note,Number(p.enabled),Date.now(),p.website??'',p.city??'',p.address??'',p.phone??'',this.userId).run();
        } else result = await this.db.prepare('UPDATE promotion_reminders SET supermarket=?,product=?,weekdays=?,start_date=?,end_date=?,note=?,enabled=?,version=version+1,updated_at=?,website=?,city=?,address=?,phone=? WHERE user_id=? AND id=? AND version=?').bind(p.supermarket,p.product,JSON.stringify(p.weekdays),p.startDate,p.endDate,p.note,Number(p.enabled),Date.now(),p.website??'',p.city??'',p.address??'',p.phone??'',this.userId,p.id,p.version).run();
      }
      if (!result.meta.changes) throw new ReminderConflict();
    }
    return this.read();
  }
}
