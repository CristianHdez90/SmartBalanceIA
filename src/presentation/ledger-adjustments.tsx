'use client';
import { useState } from 'react';
import { ArrowRightLeft, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { followingMonth, money, type Ledger, type Movement } from '@/src/domain/finance';
import { toast } from 'sonner';

export const monthName = (month:string) => new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric'}).format(new Date(month+'-15T12:00:00'));
type Save = (payload:unknown)=>Promise<Ledger>;
export function TransferBalance({month,available,disabled,save,onSaved}:{month:string;available:number;disabled:boolean;save:Save;onSaved:(ledger:Ledger)=>void}) {
 const [id,setId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const next=followingMonth(month);
 return <><button className="transfer-balance-button" disabled={disabled||available<=0||next>'2099-12'} onClick={()=>{setError('');setId(crypto.randomUUID());}}><ArrowRightLeft size={15}/> Trasladar al siguiente mes</button>
 <Dialog open={!!id} onOpenChange={open=>{if(!open&&!busy)setId(null);}}><DialogContent className="ledger-adjustment-dialog"><DialogTitle>Trasladar saldo disponible</DialogTitle><DialogDescription>Reserva parte del disponible de {monthName(month)} para pagar obligaciones en {monthName(next)}.</DialogDescription>
 <form onSubmit={async event=>{event.preventDefault();if(busy||!id)return;const amount=Number(new FormData(event.currentTarget).get('amount'));setBusy(true);setError('');try{onSaved(await save({action:'transferBalance',id,month,amount}));setId(null);toast.success('Saldo trasladado a '+monthName(next));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <div className="transfer-explanation"><span>Disponible para trasladar</span><strong>{money(available)}</strong><p>El importe se descontará de este mes y aparecerá en el siguiente como saldo trasladado. Puedes trasladar todo o una parte.</p></div>
 <label>Importe a trasladar (COP)<input name="amount" type="number" min="1" max={Math.min(available,999999999999)} step="1" required defaultValue={Math.min(available,999999999999)} disabled={busy}/></label>
 {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setId(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Trasladando…':'Trasladar saldo'}</button></div></form></DialogContent></Dialog></>;
}

export function EditPaymentDate({movement,name,disabled,save,onSaved}:{movement:Movement;name:string;disabled:boolean;save:Save;onSaved:(ledger:Ledger)=>void}) {
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <><button className="reverse-button" disabled={disabled} aria-label={'Editar fecha de pago de '+name} onClick={()=>{setError('');setOpen(true);}}><Pencil size={15}/><span>Editar fecha</span></button>
 <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="ledger-adjustment-dialog"><DialogTitle>Editar fecha de pago</DialogTitle><DialogDescription>{name} · {money(movement.amount)}. El pago seguirá aplicado a {monthName(movement.month)}; puedes registrar una fecha anterior si pagaste anticipadamente.</DialogDescription>
 <form onSubmit={async event=>{event.preventDefault();if(busy)return;const date=new FormData(event.currentTarget).get('date');setBusy(true);setError('');try{onSaved(await save({action:'updatePaymentDate',id:movement.id,month:movement.month,date}));setOpen(false);toast.success('Fecha de pago y reporte actualizados');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <label>Fecha real de pago<input name="date" type="date" min="2000-01-01" max="2099-12-31" required defaultValue={movement.date??''} disabled={busy}/></label>
 {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar fecha'}</button></div></form></DialogContent></Dialog></>;
}
