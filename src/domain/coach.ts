import { totals, type Ledger } from './finance';
import { paymentReport } from './payment-report';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface CoachTurn { id: string; conversationId: string; month: string; includeContext: boolean; question: string; answer: string | null; status: 'pending' | 'complete' | 'failed'; createdAt: number }
export interface CoachRepository {
  clearHistory(now:number): Promise<boolean>;
  find(id: string): Promise<CoachTurn | null>;
  history(conversationId: string, month: string, includeContext: boolean): Promise<CoachTurn[]>;
  latest(month: string, includeContext: boolean): Promise<string | null>;
  reserve(turn: CoachTurn, dayStart: number): Promise<boolean>;
  complete(id: string, answer: string): Promise<void>;
  fail(id: string): Promise<void>;
}
export interface FinancialAI { respond(messages: ChatMessage[], context: ReturnType<typeof financialContext> | null, date: string): Promise<string> }
export function colombiaDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
// Fixed labels keep account numbers and free-form personal details out of AI context.
export function obligationLabel(name:string):string {
 const normalized=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const labels:Array<[RegExp,string]>=[
 [/vivienda/,'Crédito de vivienda'],[/express fijo/,'Crédito Express Fijo'],
 [/finesa/,'Seguro de vehículo Finesa'],[/seguro.*vehiculo/,'Seguro de vehículo'],[/credito.*vehiculo/,'Crédito de vehículo'],
 [/sistecredito/,'Sistecrédito'],[/chevignon/,'Tarjeta de crédito Chevignon'],[/pepe\s*ganga/,'Tarjeta de crédito PepeGanga'],
 [/ame.*expres.*bancolombia/,'Tarjeta American Express Bancolombia'],[/visa oro.*bancolombia/,'Tarjeta Visa Oro Bancolombia'],
 [/banco\s*bogota/,'Tarjeta de crédito Banco de Bogotá'],[/cencosud/,'Tarjeta de crédito Cencosud'],[/colpatria/,'Tarjeta de crédito Colpatria'],
 [/finandina/,'Tarjeta de crédito Finandina'],[/falabella/,'Tarjeta de crédito Falabella'],[/\bnu\b/,'Tarjeta de crédito Nu'],[/tuya/,'Tarjeta de crédito Tuya'],
 [/addi/,'Cupo Addi'],[/administracion/,'Administración'],[/servicios publicos/,'Servicios públicos'],
 ];
 return labels.find(([pattern])=>pattern.test(normalized))?.[1]??(normalized.includes('tarjeta')?'Tarjeta de crédito':normalized.includes('credito')?'Crédito':normalized.includes('seguro')?'Seguro':'Obligación');
}

export function financialContext(ledger: Ledger, month: string, date: string) {
  const sums = totals(ledger);
  const debts=ledger.obligations.filter(o=>o.category==='Créditos'||o.category==='Tarjetas');
  // Only fixed descriptive labels are shared; omit raw names, IDs, numbers and notes.
  return {
    month, currency: 'COP', evaluatedOn: date,
    recordedIncome: sums.income, knownMonthlyObligations: sums.committed,
    recordedPayments: sums.paid, recordedDailyExpenses:sums.dailyExpenses, pendingKnownAmounts: sums.pending, recordedAvailable: sums.available,
    debtCoverage: { recordedDebts:debts.length, knownTotalDebt:debts.reduce((sum,o)=>sum+(o.totalDebt??0),0), missingTotalDebt:debts.filter(o=>o.totalDebt==null).length, missingInterestRate:debts.filter(o=>o.interestMV==null&&o.interestEA==null).length },
    dailyExpensesByCategory:Object.entries(ledger.expenses.reduce<Record<string,number>>((result,expense)=>{result[expense.category]=(result[expense.category]??0)+expense.amount;return result;},{})).map(([category,total])=>({category,total})),
    unrecordedContext:['Gastos cotidianos todavía no registrados','Ahorros y fondo de emergencia','Confirmación de que la cuota registrada equivale al mínimo contractual'],
    unknownAmounts: ledger.obligations.filter(o=>o.amount===null).length,
    missingDueDates: ledger.obligations.filter(o=>!o.dueDate).length,
    obligations: ledger.obligations.slice(0,100).map((o,i) => {
      const report = paymentReport(o,ledger.movements,date);
      return { reference:`Obligación ${i+1}`, label:obligationLabel(o.name), category:o.category, totalDebt:o.totalDebt??null, interestMV:o.interestMV??null, interestEA:o.interestEA??null, monthlyAmount:o.amount, paid:report.paid, remaining:report.remaining, dueDate:o.dueDate, cutoffDate:o.cutoffDate, status:report.status };
    }),
    omittedObligations: Math.max(0,ledger.obligations.length-100),
    limitations: 'Los ingresos y gastos pueden estar incompletos. Los saldos totales y tasas son datos manuales del extracto; null significa desconocido. Los pagos de cuotas no reducen automáticamente esos saldos. Los gastos diarios corresponden solo a los registros del mes. No incluye ahorro. Disponible registrado no equivale a dinero libre para ahorrar. Las cuotas mensuales no son capital pendiente del crédito.',
  };
}
export function turnMessages(turns: CoachTurn[]): ChatMessage[] {
  return turns.filter(t=>t.status==='complete' && t.answer).flatMap(t=>[{role:'user' as const,content:t.question},{role:'assistant' as const,content:t.answer!}]);
}
