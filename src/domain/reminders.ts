import { z } from 'zod';

const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, 'Fecha no válida');
export const reminderSettings = z.object({
  payments: z.boolean(), promotions: z.boolean(),
  advanceDays: z.number().int().min(0).max(14), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();
export const defaultReminderSettings = { payments: true, promotions: true, advanceDays: 3, time: '08:00' };
export type ReminderSettings = z.infer<typeof reminderSettings>;
const promotionFields = {
  id: z.string().uuid(), supermarket: z.string().trim().min(2).max(80),
  product: z.string().trim().min(2).max(120),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v => new Set(v).size === v.length),
  startDate: date, endDate: date, note: z.string().trim().max(300), enabled: z.boolean(),
  version: z.number().int().min(0),
};
export const reminderCommand = z.union([
  z.object({ action: z.literal('settings'), settings: reminderSettings }).strict(),
  z.object({ action: z.literal('save'), ...promotionFields }).strict().refine(v => v.endDate >= v.startDate, 'La vigencia final debe ser posterior al inicio'),
  z.object({ action: z.literal('delete'), id: z.string().uuid(), version: z.number().int().min(1) }).strict(),
]);
export type ReminderCommand = z.infer<typeof reminderCommand>;
export type PromotionReminder = z.infer<z.ZodObject<typeof promotionFields>>;
export type PendingReminder = { id: string; dueDate: string | null; pending: number | null };
export type DeviceReminder = { id: string; at: number; title: string; body: string; section: 'reminders' };
export const bogotaDay = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
export function addDays(day: string, days: number) {
  return new Date(Date.parse(day + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
// One private summary per day keeps the plan below iOS's pending notification limit.
// Amounts, obligation names and products never appear on the lock screen.
export function buildReminderPlan(settings: ReminderSettings, promotions: PromotionReminder[], obligations: PendingReminder[], now = Date.now()): DeviceReminder[] {
  const plan: DeviceReminder[] = [], today = bogotaDay(now);
  for (let offset = 0; offset < 30; offset++) {
    const day = addDays(today, offset), at = Date.parse(`${day}T${settings.time}:00-05:00`);
    if (at <= now + 5000) continue;
    const payments = settings.payments && obligations.some(o => o.dueDate && o.pending !== null && o.pending > 0 && (o.dueDate <= day || o.dueDate === addDays(day, settings.advanceDays)));
    const promos = settings.promotions && promotions.some(p => p.enabled && p.startDate <= day && p.endDate >= day && p.weekdays.includes(new Date(day + 'T12:00:00Z').getUTCDay()));
    if (payments || promos) plan.push({ id: `balance-${day}`, at, title: 'Mi Balance IA', body: payments && promos ? 'Tienes pagos por revisar y promociones registradas para hoy.' : payments ? 'Tienes pagos por revisar. Consulta tus obligaciones.' : 'Tienes promociones registradas para hoy. Consulta tu calendario.', section: 'reminders' });
  }
  return plan;
}
export class ReminderConflict extends Error { constructor() { super('El registro cambió o ya no existe. Actualiza la lista e inténtalo nuevamente.'); } }
