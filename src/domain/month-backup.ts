import { createHash } from 'node:crypto';
import { z } from 'zod';
import { reportStatuses } from './payment-report';
import { followingMonth, type Ledger } from './finance';

export const MAX_BACKUP_BYTES=4*1024*1024;
export class BackupError extends Error { constructor(message:string,readonly status=400){super(message);} }
const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const text=z.string().max(2000).refine(s=>!s.includes('\0'),'Texto no válido');
const id=text.pipe(z.string().min(1).max(300));
const cash=z.number().int().min(0).max(999999999999);
const date=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/).refine(s=>{const d=new Date(s+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s;});
const day=z.number().int().min(1).max(31).nullable();
const rate=z.number().finite().min(0).max(100000).nullable();
const obligation=z.object({id,user_id:id,month,name:text.pipe(z.string().min(1)),category:text,amount:cash.nullable(),note:text,cutoff_date:date.nullable(),due_date:date.nullable(),series_id:id.nullable(),cutoff_day:day,due_day:day,total_debt:cash.nullable(),bank:text,banking_url:text.refine(s=>{if(!s)return true;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}),interest_mv:rate,interest_ea:rate,recurring_amount:cash.nullable()}).strict();
const movement=z.object({id,user_id:id,month,kind:z.enum(['income','payment']),obligation_id:id.nullable(),amount:cash.positive(),date:date.nullable(),description:text}).strict();
const expense=z.object({id,user_id:id,month,category:text,amount:cash.positive(),date,description:text}).strict();
const transfer=z.object({id,user_id:id,from_month:month,to_month:month,amount:cash.positive(),created_at:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
const carry=z.object({id,user_id:id,source_id:id,target_id:id,from_month:month,to_month:month,amount:cash.positive(),reason:text,created_at:z.number().int().nonnegative().max(8640000000000000)}).strict();
const history=z.object({id,user_id:id,obligation_id:id,month,from_status:z.enum(reportStatuses).nullable(),to_status:z.enum(reportStatuses),effective_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),recorded_at:z.number().int().nonnegative().max(8640000000000000),cause:text,basis:text}).strict();
export const backupSchema=z.object({version:z.literal(1),scope:z.enum(['ledger','expenses']).optional(),month,userId:id,exportedAt:z.string().datetime(),obligations:z.array(obligation).max(10000),movements:z.array(movement).max(10000),daily_expenses:z.array(expense).max(10000),balance_transfers:z.array(transfer).max(10000),obligation_carries:z.array(carry).max(10000).optional(),obligation_history:z.array(history).max(10000).optional()}).strict();
export type MonthBackup=z.infer<typeof backupSchema>;
export const tables=['obligations','movements','daily_expenses','balance_transfers','obligation_carries','obligation_history'] as const;
export function backupTables(b:MonthBackup){return b.scope==='expenses'?(['daily_expenses'] as const):tables;}
export type BackupTable=typeof tables[number];
export const columns:Record<BackupTable,string[]>={
 obligations:Object.keys(obligation.shape),movements:Object.keys(movement.shape),daily_expenses:Object.keys(expense.shape),balance_transfers:Object.keys(transfer.shape),obligation_carries:Object.keys(carry.shape),obligation_history:Object.keys(history.shape),
};
export function validateBackup(input:unknown):MonthBackup{
 const parsed=backupSchema.safeParse(input);
 if(!parsed.success)throw new BackupError('El respaldo contiene campos o fechas inválidos. Descarga un nuevo respaldo SQL desde Mi Balance.');
 const b=parsed.data;
 if(b.scope==='expenses'&&(b.obligations.length||b.movements.length||b.balance_transfers.length||b.obligation_carries?.length||b.obligation_history?.length))throw new BackupError('El respaldo de gastos contiene datos de otro módulo.');
 if(tables.reduce((n,t)=>n+(b[t]??[]).length,0)>10000)throw new BackupError('El respaldo supera el límite de 10.000 registros por mes.');
 const obligations=new Set(b.obligations.map(o=>o.id));
 for(const table of tables){
  const rows=b[table]??[];if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new BackupError('El respaldo contiene registros duplicados.');
  for(const row of rows)if(row.user_id!==b.userId||('month' in row&&row.month!==b.month))throw new BackupError('Los registros no corresponden a la cuenta o al mes del respaldo.');
 }
 for(const m of b.movements)if(m.kind==='payment'?!m.obligation_id||!obligations.has(m.obligation_id):m.obligation_id!==null)throw new BackupError('Hay movimientos sin una obligación válida dentro del respaldo.');
 for(const t of [...b.balance_transfers,...(b.obligation_carries??[])])if(followingMonth(t.from_month)!==t.to_month||(t.from_month!==b.month&&t.to_month!==b.month))throw new BackupError('El respaldo contiene un traslado que no corresponde al mes.');
 for(const t of b.obligation_carries??[])if((t.from_month===b.month&&!obligations.has(t.source_id))||(t.to_month===b.month&&!obligations.has(t.target_id)))throw new BackupError('El traslado de obligación no tiene un registro asociado en el respaldo.');
 return b;
}
export function fingerprint(b:MonthBackup){return createHash('sha256').update(JSON.stringify([b.month,b.userId,b.scope??'ledger',...tables.map(t=>b[t]??[])])).digest('hex');}
export function counts(b:MonthBackup){return {carries:b.obligation_carries?.length??0,history:b.obligation_history?.length??0,obligations:b.obligations.length,movements:b.movements.length,expenses:b.daily_expenses.length,transfers:b.balance_transfers.length};}
export function toLedger(b:MonthBackup):Ledger{return {
 obligations:b.obligations.map(o=>({id:o.id,month:o.month,name:o.name,category:o.category,amount:o.amount===null?null:o.amount+(b.obligation_carries??[]).filter(t=>t.target_id===o.id).reduce((s,t)=>s+t.amount,0),transferredAmount:(b.obligation_carries??[]).filter(t=>t.source_id===o.id).reduce((s,t)=>s+t.amount,0),note:o.note,cutoffDate:o.cutoff_date,dueDate:o.due_date})),
 movements:b.movements.map(m=>({...m,obligationId:m.obligation_id})),expenses:b.daily_expenses as unknown as Ledger['expenses'],
 transfers:b.balance_transfers.map(t=>({id:t.id,fromMonth:t.from_month,toMonth:t.to_month,amount:t.amount,createdAt:t.created_at,direction:t.to_month===b.month?'incoming':'outgoing'})),
};}
function literal(value:unknown){return value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";}
export function encodeBackup(b:MonthBackup):string{
 const json=JSON.stringify(b);const hash=createHash('sha256').update(json).digest('hex');
 const sql=tables.flatMap(t=>(b[t]??[]).map(row=>`INSERT OR IGNORE INTO ${t} (${columns[t].join(', ')}) VALUES (${columns[t].map(c=>literal((row as Record<string,unknown>)[c])).join(', ')});`));
 return [`-- MI_BALANCE_BACKUP_V1 ${Buffer.from(json).toString('base64')}`,`-- SHA256 ${hash}`,`-- Mi Balance: respaldo mensual ${b.month}. Fecha UTC: ${b.exportedAt}`, '-- Para restaurar el mes completo usa Obligaciones > Respaldos > Restaurar SQL.', '-- Estas consultas INSERT recuperan filas faltantes en un esquema Mi Balance existente.', '-- Los traslados pertenecen a dos meses. No incluye usuarios, contrasenas, sesiones ni Metas.', 'BEGIN TRANSACTION;',...sql,'COMMIT;',''].join('\n');
}
export function decodeBackup(sql:string):MonthBackup{
 if(Buffer.byteLength(sql,'utf8')>MAX_BACKUP_BYTES)throw new BackupError('El archivo supera el máximo de 4 MB.');
 const source=sql.replace(/^\uFEFF/,'');const match=/^-- MI_BALANCE_BACKUP_V1 ([A-Za-z0-9+/=]+)\r?\n/.exec(source);
 if(!match)throw new BackupError('Selecciona un archivo SQL descargado desde Respaldos de Mi Balance.');
 let b:MonthBackup;try{b=validateBackup(JSON.parse(Buffer.from(match[1],'base64').toString('utf8')));}catch(error){if(error instanceof BackupError)throw error;throw new BackupError('El archivo está incompleto o dañado.');}
 // Uploaded SQL is never executed: accept only our canonical envelope and parameterize validated rows.
 if(encodeBackup(b).trim()!==source.trim())throw new BackupError('El respaldo fue modificado o está dañado. Utiliza el archivo original descargado.');
 return b;
}
