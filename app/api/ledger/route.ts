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
 try { return Response.json(await new LedgerService(await repository(request)).execute(await request.json()),{headers:{'Cache-Control':'no-store'}}); }
 catch(error) { if(error instanceof AuthError)return Response.json({error:error.message},{status:error.status});if(error instanceof DatabaseError)return Response.json({error:error.message,code:error.code},{status:503});console.error(error); const validation = error instanceof ZodError; const message = error instanceof Error ? error.message : ''; const business = /fecha debe|Selecciona|abono supera|valor no puede/.test(message); return Response.json({error:validation ? 'Revisa los campos: cuota positiva, deuda no negativa, días del 1 al 31, tasas no negativas y enlace HTTPS válido.' : business ? message : 'No se pudo guardar. Tus datos del formulario se conservan; intenta nuevamente.'},{status:validation || business ? 400 : 503}); }
}
