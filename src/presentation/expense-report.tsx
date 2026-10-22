'use client';
import ListPagination, {usePagination} from './list-pagination';
import { TriangleAlert } from 'lucide-react';
import type { DailyExpense } from '../domain/finance';
import { expenseBreakdown } from '../domain/expense-report';
import { usePrivateMoney } from './amount-privacy';
import './expense-report.css';
export default function ExpenseReport({expenses,monthLabel,loading,error}:{expenses:DailyExpense[];monthLabel:string;loading:boolean;error:string}){
 const money=usePrivateMoney();const {total,rows}=expenseBreakdown(expenses);
 const pager=usePagination(rows,monthLabel);
 return <section className="expense-category-report"><h2>Reporte por categorías · {monthLabel}</h2>{loading?<p>Cargando gastos…</p>:error?<p role="alert">No se pudo cargar el reporte. Actualiza los datos del mes.</p>:!rows.length?<p>No hay gastos registrados en este mes.</p>:<><p>Total del mes: <strong>{money(total)}</strong></p><div className="expense-risk" role="note"><TriangleAlert size={22}/><div><strong>Alerta de riesgo por concentración de gasto</strong><p>{rows.filter(r=>r.highest).map(r=>r.category).join(', ')}: mayor gasto del mes. Revisa si se ajusta a tu presupuesto. Esta alerta señala concentración, no confirma un exceso de presupuesto.</p></div></div><div className="expense-category-rows">{pager.items.map(row=><article key={row.category} className={row.highest?'highest-expense':undefined}><div><strong>{row.category}</strong><span>{money(row.amount)} · {row.percentage.toLocaleString('es-CO',{maximumFractionDigits:1})}%</span></div><progress max={100} value={row.percentage} aria-label={'Porcentaje de gasto en '+row.category}/>{row.highest&&<small><TriangleAlert size={14}/> Mayor gasto · Revisar</small>}</article>)}</div><ListPagination pager={pager} label="categorías de gastos"/><p>Porcentaje calculado sobre los gastos diarios del mes seleccionado. Los valores mostrados se redondean.</p></>}</section>;
}
