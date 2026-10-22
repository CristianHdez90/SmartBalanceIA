import {z} from 'zod';
import {database} from '@/src/infrastructure/database';
import {D1AuthRepository,AuthError,sessionToken} from '@/src/infrastructure/d1-auth';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';
import {isExpoToken} from '@/src/infrastructure/expo-push';
import {WebPushRepository,WebPushError,pushSessionHash} from '@/src/infrastructure/web-push';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!isAllowedOrigin(request))return Response.json({error:'Origen no permitido'},{status:403});
 try{
  const db=database(),user=await new D1AuthRepository(db).requireUser(request);
  const raw=await request.text();if(raw.length>2048)return new Response('Solicitud demasiado grande',{status:413});
  const c=z.object({action:z.enum(['subscribe','unsubscribe','test','status']),token:z.string().refine(isExpoToken)}).strict().parse(JSON.parse(raw));
  const endpoint='expo:'+c.token,repo=new WebPushRepository(db,user.id,pushSessionHash(sessionToken(request)));
  if(c.action==='subscribe')await repo.subscribe({endpoint,keys:{p256dh:'',auth:''}});
  if(c.action==='unsubscribe'){await repo.remove(endpoint);return Response.json({enabled:false});}
  if(c.action==='test')await repo.test(endpoint);
  return Response.json({enabled:await repo.status(endpoint)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof AuthError||e instanceof WebPushError?e.message:'No se pudo configurar el dispositivo.'},{status:e instanceof AuthError||e instanceof WebPushError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:503});}
}
