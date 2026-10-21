import { z } from 'zod';
import { database } from '@/src/infrastructure/database';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';
import { isPushEndpoint } from '@/src/domain/web-push';
import { dispatchWebPush, pushConfiguration } from '@/src/infrastructure/web-push';

export const runtime='nodejs';
const lastCheck=new Map<string,number>();
const command=z.object({seconds:z.union([z.literal(30),z.literal(60),z.literal(600),z.literal(1200)]),endpoint:z.string().max(4096).refine(isPushEndpoint)}).strict();
export async function POST(request:Request) {
  if(process.env.NODE_ENV!=='development' || !['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)) return new Response('Not found',{status:404});
  if(!isAllowedOrigin(request)) return new Response('Forbidden',{status:403});
  try {
    const db=database(),user=await new D1AuthRepository(db).requireUser(request);
    const body=command.parse(await request.json()),now=Date.now();
    if(!pushConfiguration()) return Response.json({error:'Configura Web Push en el servidor local antes de probar.'},{status:503});
    for(const [id,time] of lastCheck) if(now-time>1200000) lastCheck.delete(id);
    const previous=lastCheck.get(user.id);
    if(previous!==undefined && now-previous<body.seconds*1000) return Response.json({error:'Espera el intervalo seleccionado antes de otra revisión.'},{status:429});
    lastCheck.set(user.id,now);
    const result=await dispatchWebPush(db,now,undefined,'vercel',{userId:user.id,endpoint:body.endpoint});
    return Response.json(result,{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}});
  } catch(e) {
    if(e instanceof AuthError) return Response.json({error:e.message},{status:e.status});
    if(e instanceof z.ZodError || e instanceof SyntaxError) return Response.json({error:'Revisa los parámetros de prueba.'},{status:400});
    return Response.json({error:'No se pudo completar la revisión local.'},{status:503});
  }
}
