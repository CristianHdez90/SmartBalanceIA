import { database } from '@/src/infrastructure/database';
import { AuthError,D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';
import { dispatchWebPush,pushConfiguration } from '@/src/infrastructure/web-push';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!isAllowedOrigin(request))return new Response('Forbidden',{status:403});
 try{const db=database(),user=await new D1AuthRepository(db).requireUser(request);
 if(!pushConfiguration())return Response.json({error:'El servidor no tiene configurado Web Push.'},{status:503});
 const result=await dispatchWebPush(db,Date.now(),undefined,'frontend',{userId:user.id});
 return Response.json(result,{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof AuthError?e.message:'No se pudieron revisar los avisos push.'},{status:e instanceof AuthError?e.status:503});}
}
