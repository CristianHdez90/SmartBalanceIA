import { addDays, bogotaDay, type PendingReminder, type PromotionReminder, type ReminderSettings } from './reminders';

export type NotificationCandidate = { id:string; day:string; kind:'promotion'|'payment'; title:string; body:string; section:'reminders'|'obligations' };
export type InboxNotification = NotificationCandidate & { active:boolean; readAt:number|null; createdAt:number; targetId?:string|null; targetMonth?:string|null };
export function todayNotifications(settings:ReminderSettings,promotions:PromotionReminder[],pending:(PendingReminder&{name?:string;note?:string})[],now=Date.now()):NotificationCandidate[] {
  const day=bogotaDay(now),weekday=new Date(day+'T12:00:00Z').getUTCDay();
  const result:NotificationCandidate[]=[];
  if(settings.promotions) for(const p of promotions) {
    if(!p.enabled||p.startDate>day||p.endDate<day||!p.weekdays.includes(weekday))continue;
    result.push({id:`promotion:${p.id}:${day}`,day,kind:'promotion',title:`Promoción de hoy · ${p.supermarket}`,body:`${p.product}\nVigencia: ${p.startDate} a ${p.endDate}.${p.note?'\n'+p.note:''}`,section:'reminders'});
  }
  if(settings.payments) for(const p of pending) {
    if(!p.dueDate||p.pending===null||p.pending<=0||p.dueDate>addDays(day,settings.advanceDays))continue;
    result.push({id:`payment:${p.id}:${day}`,day,kind:'payment',title:p.name||'Obligación por revisar',body:`${p.dueDate<day?'Pago vencido':p.dueDate===day?'Vence hoy':'Próximo vencimiento'}: ${p.dueDate}.${p.note?'\n'+p.note:''}`,section:'obligations'});
  }
  return result;
}
