import { paidFor, type Obligation, type Movement } from './finance';

export const reportStatuses = ['Cumplido a tiempo', 'Pagado fuera de plazo', 'Próximo a vencer', 'Vencido', 'Pendiente', 'Sin fecha límite', 'Sin valor', 'Pago sin fecha'] as const;
export type ReportStatus = typeof reportStatuses[number];
export function paymentDetails(obligation: Obligation, movements: Movement[]) {
  const payments = movements.filter(m => m.kind === 'payment' && m.obligationId === obligation.id);
  const dates = payments.flatMap(m => m.date ? [m.date] : []).sort();
  return { lastDate: dates.at(-1) ?? null, hasPayments: payments.length > 0, missingDates: payments.some(m => !m.date) };
}
export function paymentReport(obligation: Obligation, movements: Movement[], today: string) {
  const paid = paidFor(obligation.id, movements);
  const details = paymentDetails(obligation, movements);
  const remaining = obligation.amount === null ? null : Math.max(0, obligation.amount - paid);
  const days = obligation.dueDate ? Math.round((Date.parse(obligation.dueDate+'T00:00:00Z') - Date.parse(today+'T00:00:00Z')) / 86400000) : null;
  let status: ReportStatus;
  if (obligation.amount === null) status = 'Sin valor';
  else if (!obligation.dueDate) status = 'Sin fecha límite';
  else if (remaining === 0) {
    if (details.lastDate && details.lastDate > obligation.dueDate) status = 'Pagado fuera de plazo';
    else if (details.missingDates || !details.lastDate) status = 'Pago sin fecha';
    else status = 'Cumplido a tiempo';
  } else if (days! < 0) status = 'Vencido';
  else if (days! <= 7) status = 'Próximo a vencer';
  else status = 'Pendiente';
  return { obligation, paid, remaining, days, status, ...details };
}
export function formatDate(date: string | null) { return date ? date.split('-').reverse().join('/') : 'Por definir'; }
