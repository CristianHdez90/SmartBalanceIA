import { BackupError, columns, counts, fingerprint, tables, validateBackup, type MonthBackup } from '../domain/month-backup';
import { totals } from '../domain/finance';
import { toLedger } from '../domain/month-backup';
import type { DatabaseClient, DatabaseStatement } from './database';

export class MonthBackups {
 constructor(private readonly db:DatabaseClient,private readonly userId:string){}
 async read(month:string):Promise<MonthBackup>{
  const results=await this.db.batch(tables.map(table=>this.db.prepare(`SELECT ${columns[table].join(',')} FROM ${table} WHERE user_id=? AND ${table==='balance_transfers'?'(from_month=? OR to_month=?)':'month=?'} ORDER BY id`).bind(this.userId,month,...(table==='balance_transfers'?[month]:[]))));
  return validateBackup({version:1,month,userId:this.userId,exportedAt:new Date().toISOString(),...Object.fromEntries(tables.map((t,i)=>[t,results[i].results]))});
 }
 private authorize(backup:MonthBackup){if(backup.userId!==this.userId)throw new BackupError('Este respaldo pertenece a otra cuenta. Inicia sesión con la cuenta que lo descargó.',403);}
 async preview(backup:MonthBackup){
  this.authorize(backup);const current=await this.read(backup.month);
  const adjacentMonths=[...new Set([...backup.balance_transfers,...current.balance_transfers].flatMap(t=>[t.from_month,t.to_month]))].filter(m=>m!==backup.month).sort();
  return {month:backup.month,exportedAt:backup.exportedAt,records:counts(backup),currentRecords:counts(current),totals:totals(toLedger(backup)),revision:fingerprint(current),adjacentMonths};
 }
 async restore(backup:MonthBackup,revision:string){
  this.authorize(backup);
  return this.db.transaction(async tx=>{
   const current=await new MonthBackups(tx,this.userId).read(backup.month);
   if(fingerprint(current)===fingerprint(backup))return {month:backup.month,records:counts(backup),unchanged:true};
   if(fingerprint(current)!==revision)throw new BackupError('Los datos cambiaron después de la vista previa. Vuelve a revisar el archivo antes de restaurar.',409);
   // Reject IDs belonging to another month or account instead of silently overwriting them.
   for(const table of tables){
    const rows=backup[table];
    for(let offset=0;offset<rows.length;offset+=300){
     const ids=rows.slice(offset,offset+300).map(r=>r.id);
     const found=await tx.prepare(`SELECT * FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
     for(const row of found.results){
      const expected=rows.find(r=>r.id===row.id)!;
      if(row.user_id!==this.userId||('month' in row&&row.month!==backup.month)||('from_month' in expected&&(row.from_month!==expected.from_month||row.to_month!==expected.to_month)))throw new BackupError('Un identificador del respaldo ya pertenece a otro mes o cuenta. No se modificó ningún dato.',409);
     }
    }
   }
   const externalReference=await tx.prepare('SELECT m.id FROM movements m JOIN obligations o ON o.id=m.obligation_id WHERE o.user_id=? AND o.month=? AND (m.month<>? OR m.user_id<>?) LIMIT 1').bind(this.userId,backup.month,backup.month,this.userId).first();
   if(externalReference)throw new BackupError('Hay pagos de otro mes vinculados a estas obligaciones. No se modificó ningún dato.',409);
   const commands:DatabaseStatement[]=[
    tx.prepare('DELETE FROM movements WHERE user_id=? AND month=?').bind(this.userId,backup.month),
    tx.prepare('DELETE FROM daily_expenses WHERE user_id=? AND month=?').bind(this.userId,backup.month),
    tx.prepare('DELETE FROM balance_transfers WHERE user_id=? AND (from_month=? OR to_month=?)').bind(this.userId,backup.month,backup.month),
    tx.prepare('DELETE FROM obligations WHERE user_id=? AND month=?').bind(this.userId,backup.month),
   ];
   for(const table of tables)for(const row of backup[table])commands.push(tx.prepare(`INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${columns[table].map(()=>'?').join(',')})`).bind(...columns[table].map(c=>(row as Record<string,string|number|null>)[c])));
   for(let offset=0;offset<commands.length;offset+=300)await tx.batch(commands.slice(offset,offset+300));
   return {month:backup.month,records:counts(backup),unchanged:false};
  });
 }
}
