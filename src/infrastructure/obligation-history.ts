import { paymentReport } from '../domain/payment-report';
import type { Ledger, ObligationHistoryEvent } from '../domain/finance';
import type { DatabaseClient, DatabaseStatement } from './database';
export const colombiaDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function offsetDate(date:string,days:number){return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
export class ObligationHistory{
 constructor(private db:DatabaseClient,private userId:string){}
 async sync(ledger:Ledger,month:string,cause:string,today=colombiaDate()){
  const existing=(await this.db.prepare('SELECT * FROM obligation_history WHERE user_id=? AND month=? ORDER BY recorded_at,id').bind(this.userId,month).all<ObligationHistoryEvent>()).results;
  const latest=new Map(existing.map(event=>[event.obligation_id,event]));let stamp=existing.reduce((n,e)=>Math.max(n,e.recorded_at+1),Date.now());
  const commands:DatabaseStatement[]=[];
  for(const o of ledger.obligations){const result=paymentReport(o,ledger.movements,today);const prior=latest.get(o.id);const basis=JSON.stringify([o.amount,o.dueDate,result.paid,result.lastDate,o.transferredAmount??0]);
   if(prior?.to_status===result.status&&prior.basis===basis)continue;
   const effective=result.status==='Próximo a vencer'&&o.dueDate?offsetDate(o.dueDate,-7):result.status==='Vencido'&&o.dueDate?offsetDate(o.dueDate,1):['Cumplido a tiempo','Pagado fuera de plazo'].includes(result.status)?result.lastDate??today:today;
   let from=prior?.to_status??null;
   const add=(to:string,date:string,why:string)=>{commands.push(this.db.prepare('INSERT INTO obligation_history(id,user_id,obligation_id,month,from_status,to_status,effective_date,recorded_at,cause,basis) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),this.userId,o.id,month,from,to,date,stamp++,why,basis));from=to;};
   if(prior?.to_status==='Pendiente'&&prior.basis===basis&&result.status==='Vencido'&&o.dueDate)add('Próximo a vencer',offsetDate(o.dueDate,-7),'Paso del tiempo: inicio de los 7 días previos al vencimiento');
   add(result.status,effective,prior?cause:'Estado inicial observado; la fecha efectiva se calcula con los datos disponibles');
  }
  if(commands.length)await this.db.batch(commands);
 }
}
