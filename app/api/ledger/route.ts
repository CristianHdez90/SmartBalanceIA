import { LedgerError, followingMonth } from '@/src/domain/finance';
import { ObligationHistory } from '@/src/infrastructure/obligation-history';
import { LedgerService, monthSchema } from '@/src/application/ledger-service';
import { D1LedgerRepository } from '@/src/infrastructure/d1-ledger';
import { ZodError } from 'zod';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import {database,DatabaseError} from '@/src/infrastructure/database';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';
export const runtime='nodejs';
async function repository(request:Request){const db=database();const user=await new D1AuthRepository(db).requireUser(request);return new D1LedgerRepository(db,user.id,false)}
export async function GET(request: Request) {
 try { const month = monthSchema.parse(new URL(request.url).searchParams.get('month')); return Response.json(await (await repository(request)).read(month),{headers:{'Cache-Control':'no-store'}}); }
 catch(error) { if(error instanceof AuthError)return Response.json({error:error.message},{status:error.status});if(error instanceof DatabaseError)return Response.json({error:error.message,code:error.code},{status:503});console.error(error); return Response.json({error:'No se pudieron cargar tus datos. Intenta nuevamente.'},{status:503}); }
}
export async function POST(request: Request) {
 if(!isAllowedOrigin(request)) return Response.json({error:'Origen no permitido'},{status:403});
 try {
  const db=database(),user=await new D1AuthRepository(db).requireUser(request),input=await request.json();
  const {commandSchema}=await import('@/src/application/ledger-service');const parsed=commandSchema.parse(input);
  const result=await db.transaction(async tx=>{
   const repo=new D1LedgerRepository(tx,user.id,false),history=new ObligationHistory(tx,user.id);
   await history.sync(await repo.read(parsed.month),parsed.month,'Paso del tiempo');
   const ledger=await new LedgerService(repo).execute(parsed);
   const causes:Record<string,string>={movement:'Registro de ingreso o pago',updatePaymentDate:'Corrección de fecha de pago',removeMovement:'Reversión de movimiento',obligation:'Edición de obligación',carryObligation:'Traslado al siguiente mes',initialize:'Paso del tiempo',reconcile:'Paso del tiempo'};
   await history.sync(ledger,parsed.month,parsed.action==='carryObligation'?'Traslado al siguiente mes: '+parsed.reason:causes[parsed.action]??'Actualización del mes');
   if(parsed.action==='carryObligation'){const next=followingMonth(parsed.month);await history.sync(await repo.read(next),next,'Saldo recibido de una obligación del mes anterior');}
   return repo.read(parsed.month);
  });return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }
 catch(error) { if(error instanceof AuthError)return Response.json({error:error.message},{status:error.status});if(error instanceof DatabaseError)return Response.json({error:error.message,code:error.code},{status:503});console.error(error); const validation = error instanceof ZodError; const message = error instanceof Error ? error.message : ''; const business = error instanceof LedgerError || /fecha debe|Selecciona|abono supera|valor no puede/.test(message); return Response.json({error:validation ? 'Revisa los campos: cuota positiva, deuda no negativa, días del 1 al 31, tasas no negativas y enlace HTTPS válido.' : business ? message : 'No se pudo guardar. Tus datos del formulario se conservan; intenta nuevamente.'},{status:validation || business ? 400 : 503}); }
}
