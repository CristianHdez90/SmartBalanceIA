export interface Obligation { id: string; month: string; name: string; category: string; amount: number | null; note: string; cutoffDate: string | null; dueDate: string | null; seriesId?: string; cutoffDay?: number | null; dueDay?: number | null; totalDebt?: number | null; bank?: string; bankingUrl?: string; interestMV?: number | null; interestEA?: number | null }
export interface Movement { id: string; month: string; kind: 'income' | 'payment'; obligationId: string | null; amount: number; date: string | null; description: string }
export const dailyExpenseCategories = ['Restaurante','Gasolina','Mantenimiento de vehículo','Merienda escolar','Mercado','Paseo','Medicina','Cervezas','Otros'] as const;
export type DailyExpenseCategory = typeof dailyExpenseCategories[number];
export interface DailyExpense { id: string; month: string; category: DailyExpenseCategory; amount: number; date: string; description: string }
export interface Ledger { obligations: Obligation[]; movements: Movement[]; expenses: DailyExpense[] }
export interface LedgerRepository { read(month: string): Promise<Ledger>; initialize(month: string): Promise<void>; addMovement(value: Movement): Promise<void>; saveObligation(value: Obligation, applyFutureAmount?: boolean): Promise<void>; removeMovement(id: string, month: string): Promise<void>; saveExpense(value: DailyExpense): Promise<void>; saveExpenses(values: DailyExpense[]): Promise<void>; removeExpense(id: string, month: string): Promise<void> }
export function paidFor(id: string, movements: Movement[]) { return movements.filter(m => m.kind === 'payment' && m.obligationId === id).reduce((sum,m) => sum + m.amount,0); }
export function status(o: Obligation, movements: Movement[]) { const paid = paidFor(o.id,movements); return o.amount === null ? 'Sin valor' : paid >= o.amount ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente'; }
export function totals(ledger: Ledger) { const committed = ledger.obligations.reduce((s,o) => s + (o.amount ?? 0),0); const paid = ledger.movements.filter(m => m.kind === 'payment').reduce((s,m) => s+m.amount,0); const income = ledger.movements.filter(m => m.kind === 'income').reduce((s,m) => s+m.amount,0); const dailyExpenses = ledger.expenses.reduce((s,e)=>s+e.amount,0); return { committed, paid, income, dailyExpenses, pending: committed-paid, available: income-paid-dailyExpenses }; }
export const money = (amount: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(amount);

export function dateForDay(month:string,day:number|null|undefined):string|null {
 if(day==null)return null;
 const [year,m]=month.split('-').map(Number);
 const last=new Date(Date.UTC(year,m,0)).getUTCDate();
 return month+'-'+String(Math.min(day,last)).padStart(2,'0');
}
