import { ZodError } from 'zod';
import { database } from '@/src/infrastructure/database';
import { AuthError, D1AuthRepository, sessionToken } from '@/src/infrastructure/d1-auth';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';
import { webPushCommand } from '@/src/domain/web-push';
import { pushConfiguration, pushSessionHash, WebPushError, WebPushRepository } from '@/src/infrastructure/web-push';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error: unknown) {
  if (error instanceof AuthError) return json({error:error.message},error.status);
  if (error instanceof WebPushError) return json({error:error.message},error.status);
  if (error instanceof ZodError || error instanceof SyntaxError) return json({error:'Suscripción no válida.'},400);
  return json({error:'No se pudo actualizar este navegador. Revisa la conexión y vuelve a intentarlo.'},503);
}
export async function GET(request: Request) {
  try {
    await new D1AuthRepository(database()).requireUser(request);
    const config=pushConfiguration();
    return json({configured:!!config,publicKey:config?.publicKey??null});
  } catch(e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return json({error:'Origen no permitido'},403);
  try {
    const db=database(),user=await new D1AuthRepository(db).requireUser(request);
    const raw=await request.text(); if(raw.length>8192) return json({error:'Solicitud demasiado grande'},413);
    const command=webPushCommand.parse(JSON.parse(raw));
    const repo=new WebPushRepository(db,user.id,pushSessionHash(sessionToken(request)));
    if(command.action==='status') return json({enabled:await repo.status(command.endpoint)});
    if(command.action==='unsubscribe') { await repo.remove(command.endpoint); return json({enabled:false}); }
    if(!pushConfiguration()) return json({error:'El servidor aún no tiene configuradas las claves Web Push.'},503);
    if(command.action==='subscribe') await repo.subscribe(command.subscription);
    else await repo.test(command.endpoint);
    return json({enabled:true});
  } catch(e) { return failure(e); }
}
