import { money } from '../domain/finance';
import type { financialContext } from '../domain/coach';
export default function InitialFinancialSummary({context}:{context:ReturnType<typeof financialContext>}) {
 const formatDate=(value:string|null)=>value?value.split('-').reverse().join('/'):'Sin definir';
 return <div className="initial-financial-summary">
  <h3>Resumen inicial de tus registros</h3>
  <p role="status">Resumen preparado. Estos datos se calculan en tu plataforma; el análisis de IA se obtiene al enviar la consulta.</p>
  <dl className="initial-summary-metrics">{[
   ['Ingresos registrados',context.recordedIncome],['Cuotas del mes',context.knownMonthlyObligations],['Pagos registrados',context.recordedPayments],['Gastos diarios',context.recordedDailyExpenses],['Pendiente de cuotas',context.pendingKnownAmounts],['Disponible registrado',context.recordedAvailable],['Deuda total conocida',context.debtCoverage.knownTotalDebt]
  ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(Number(value))}</dd></div>)}</dl>
  <p>Deuda total: {context.debtCoverage.recordedDebts-context.debtCoverage.missingTotalDebt} de {context.debtCoverage.recordedDebts} créditos o tarjetas tienen saldo registrado. El disponible no equivale a ahorro ni a dinero libre.</p>
  <p>Por completar: {context.unknownAmounts} cuotas, {context.missingDueDates} fechas límite, {context.debtCoverage.missingTotalDebt} saldos de deuda y {context.debtCoverage.missingInterestRate} tasas. Se incluyen {context.dailyExpensesByCategory.length} categorías de gastos diarios registradas; los ahorros aún no se administran aquí.</p>
  <details><summary>Ver obligaciones incluidas ({context.obligations.length})</summary><ul>{context.obligations.map(o=><li key={o.reference}><strong>{o.label}</strong><span>Cuota: {o.monthlyAmount==null?'Sin definir':money(o.monthlyAmount)} · Pendiente: {o.remaining==null?'Sin definir':money(o.remaining)}</span><span>Límite: {formatDate(o.dueDate)} · {o.status}</span><span>Deuda: {o.totalDebt==null?'Sin definir':money(o.totalDebt)} · M.V.: {o.interestMV==null?'Sin definir':o.interestMV+'%'} · E.A.: {o.interestEA==null?'Sin definir':o.interestEA+'%'}</span></li>)}</ul>{context.omittedObligations>0&&<p>{context.omittedObligations} obligaciones adicionales no se incluyen en el contexto de IA.</p>}</details>
 </div>;
}
