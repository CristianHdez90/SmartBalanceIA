'use client';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { money, type Ledger } from '@/src/domain/finance';
import { formatDate, paymentDetails, paymentReport, reportStatuses } from '@/src/domain/payment-report';

export function PaymentDate({obligation, movements}: {obligation: Ledger['obligations'][number]; movements: Ledger['movements']}) {
  const details = paymentDetails(obligation, movements);
  return <span>Último pago: <b>{details.lastDate ? formatDate(details.lastDate) : details.hasPayments ? 'Fecha no informada' : 'Sin pagos'}</b>{details.missingDates && details.lastDate && <small>Hay abonos sin fecha</small>}</span>;
}
export default function PaymentReport({ledger, today, monthLabel, loading}: {ledger: Ledger; today: string; monthLabel: string; loading: boolean}) {
  const [filter, setFilter] = useState('Todos');
  const rows = ledger.obligations.map(o => paymentReport(o, ledger.movements, today)).sort((a,b) => (a.obligation.dueDate ?? '9999').localeCompare(b.obligation.dueDate ?? '9999') || a.obligation.name.localeCompare(b.obligation.name));
  const visible = rows.filter(r => filter === 'Todos' || r.status === filter);
  if(loading) return <div className="empty">Cargando reporte…</div>;
  return <section className="payment-report">
    <div className="movement-heading"><h2>Reporte de pagos · {monthLabel}</h2><p className="muted">Obligaciones del mes seleccionado. Evaluado al {formatDate(today)} (Colombia). Próximas: hoy y los siguientes 7 días.</p></div>
    <div className="report-cards">{['Cumplido a tiempo','Próximo a vencer','Vencido'].map(state => <button key={state} className={'report-card report-'+state.replaceAll(' ','-')} aria-pressed={filter === state} onClick={() => setFilter(filter === state ? 'Todos' : state)}><span>{state}</span><strong>{rows.filter(r => r.status === state).length}</strong><small>{money(rows.filter(r => r.status === state).reduce((s,r) => s + (state === 'Cumplido a tiempo' ? r.paid : r.remaining ?? 0),0))}{state !== 'Cumplido a tiempo' ? ' por pagar' : ' pagado'}</small></button>)}</div>
    <div className="table-toolbar"><span>{visible.length} obligaciones</span><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filtrar reporte de pagos"><SelectValue/></SelectTrigger><SelectContent>{['Todos',...reportStatuses].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    <Table><TableHeader><TableRow><TableHead>Obligación</TableHead><TableHead>Fecha límite</TableHead><TableHead>Último pago registrado</TableHead><TableHead>Resultado</TableHead><TableHead className="numeric">Saldo pendiente</TableHead></TableRow></TableHeader><TableBody>{visible.map(r=><TableRow key={r.obligation.id}><TableCell>{r.obligation.name}</TableCell><TableCell>{formatDate(r.obligation.dueDate)}</TableCell><TableCell>{r.lastDate ? formatDate(r.lastDate) : r.hasPayments ? 'Fecha no informada' : 'Sin pagos'}{r.missingDates && r.lastDate && <small className="block muted">Hay abonos sin fecha</small>}</TableCell><TableCell><span className={'report-status report-'+r.status.replaceAll(' ','-')}>{r.status}</span>{r.remaining !== null && r.remaining > 0 && r.days !== null && <small className="block muted">{r.days < 0 ? `${-r.days} días de atraso` : r.days === 0 ? 'Vence hoy' : `Vence en ${r.days} días`}</small>}</TableCell><TableCell className="numeric">{r.remaining === null ? 'Por definir' : money(r.remaining)}</TableCell></TableRow>)}</TableBody></Table>
    {!visible.length && <div className="empty">No hay obligaciones en esta categoría.</div>}
    <p className="report-explanation">Cumplido a tiempo significa que todos los abonos necesarios se registraron con fecha igual o anterior al vencimiento. Un abono parcial no elimina el vencimiento del saldo. Los pagos sin fecha o sin fecha límite no se consideran cumplidos a tiempo.</p>
  </section>;
}
