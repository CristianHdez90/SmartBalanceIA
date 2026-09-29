'use client';
import { useState } from 'react';
import { DatabaseBackup, Download, FileSpreadsheet, FileCode, Upload, LoaderCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { money } from '@/src/domain/finance';
import { monthName } from './ledger-adjustments';
import { toast } from 'sonner';

type Counts={obligations:number;movements:number;expenses:number;transfers:number};
type Preview={month:string;exportedAt:string;records:Counts;currentRecords:Counts;revision:string;adjacentMonths:string[];totals:{income:number;available:number;pending:number}};
const countLabels:Record<keyof Counts,string>={obligations:'Obligaciones',movements:'Ingresos y pagos',expenses:'Gastos diarios',transfers:'Traslados'};
async function request(sql:string,action:'preview'|'restore',revision?:string){const response=await fetch('/api/ledger/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,sql,...(revision?{revision}:{})})});const result=await response.json();if(!response.ok)throw new Error(result.error??'No se pudo procesar el respaldo.');return result;}
export default function MonthlyBackup({month,disabled,onRestored}:{month:string;disabled:boolean;onRestored:(month:string)=>void}){
 const [downloading,setDownloading]=useState('');const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [sql,setSql]=useState('');const [filename,setFilename]=useState('');const [preview,setPreview]=useState<Preview|null>(null);const [confirmed,setConfirmed]=useState(false);
 async function download(format:'xlsx'|'csv'|'sql'){
  setDownloading(format);
  try{const response=await fetch(`/api/ledger/backup?month=${month}&format=${format}`,{cache:'no-store'});if(!response.ok){const result=await response.json();throw new Error(result.error??'No se pudo descargar.');}const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`mi-balance-${month}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast.success('Descarga preparada: '+monthName(month));}catch(e){toast.error((e as Error).message);}finally{setDownloading('');}
 }
 return <section className="monthly-backup" aria-label="Respaldos del mes"><div className="backup-heading"><DatabaseBackup size={19}/><div><h2>Respaldos del mes</h2><p>Descarga {monthName(month)} con obligaciones, ingresos, pagos, gastos y traslados.</p></div></div><div className="backup-actions">
 <button className="secondary" disabled={disabled||!!downloading} onClick={()=>download('xlsx')}><FileSpreadsheet size={16}/>{downloading==='xlsx'?'Preparando…':'Excel (.xlsx)'}</button>
 <button className="secondary" disabled={disabled||!!downloading} onClick={()=>download('csv')}><Download size={16}/>{downloading==='csv'?'Preparando…':'CSV'}</button>
 <button className="secondary" disabled={disabled||!!downloading} onClick={()=>download('sql')}><FileCode size={16}/>{downloading==='sql'?'Preparando…':'Respaldo SQL'}</button>
 <button className="secondary" onClick={()=>{setError('');setPreview(null);setSql('');setFilename('');setConfirmed(false);setOpen(true);}}><Upload size={16}/> Restaurar SQL</button>
 </div><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="ledger-adjustment-dialog backup-dialog"><DialogTitle>Restaurar respaldo mensual</DialogTitle><DialogDescription>Selecciona el archivo .sql original descargado desde Mi Balance. Se recuperará el mes guardado en el archivo, aunque estés viendo otro mes.</DialogDescription>
 <label className="backup-file-label">Archivo de respaldo SQL (máximo 4 MB)<input key={String(open)} type="file" accept=".sql,application/sql,text/plain" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];setPreview(null);setConfirmed(false);setError('');setSql('');setFilename(file?.name??'');if(!file)return;if(file.size>4*1024*1024){setError('El archivo supera el máximo de 4 MB.');return;}setBusy(true);try{const text=await file.text();const result=await request(text,'preview') as Preview;setSql(text);setPreview(result);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></label>
 {busy&&!preview&&<p className="backup-loading" role="status"><LoaderCircle size={17} className="spin"/> Revisando respaldo…</p>}
 {preview&&<div className="backup-preview"><h3>{monthName(preview.month)}</h3><p>{filename} · Guardado el {new Date(preview.exportedAt).toLocaleString('es-CO')}</p><table><thead><tr><th>Registros</th><th>En archivo</th><th>Actuales</th></tr></thead><tbody>{(Object.keys(countLabels) as (keyof Counts)[]).map(key=><tr key={key}><td>{countLabels[key]}</td><td>{preview.records[key]}</td><td>{preview.currentRecords[key]}</td></tr>)}</tbody></table><div className="backup-totals"><span>Disponible del respaldo <b>{money(preview.totals.available)}</b></span><span>Saldo pendiente <b>{money(preview.totals.pending)}</b></span></div>
 <p className="backup-replace-note">Al restaurar se reemplazarán los registros financieros de <strong>{monthName(preview.month)}</strong> por los del archivo. Descarga primero el respaldo SQL actual si quieres conservarlo.</p>
 {preview.adjacentMonths.length>0&&<p className="backup-replace-note">Los traslados también actualizarán el saldo relacionado en: {preview.adjacentMonths.map(monthName).join(', ')}.</p>}
 <label className="backup-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo restaurar {monthName(preview.month)} con este archivo.</label></div>}
 {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy||!preview||!confirmed} onClick={async()=>{if(!preview||!confirmed||busy)return;setBusy(true);setError('');try{const result=await request(sql,'restore',preview.revision);onRestored(result.month);setOpen(false);toast.success('Respaldo restaurado en '+monthName(result.month));}catch(e){setError((e as Error).message);setPreview(null);setConfirmed(false);}finally{setBusy(false);}}}>{busy&&preview?'Restaurando…':'Restaurar mes'}</button></div></DialogContent></Dialog></section>;
}
