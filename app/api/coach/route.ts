import { ZodError } from 'zod';
import { CoachError, CoachService } from '@/src/application/coach-service';
import { monthSchema } from '@/src/application/ledger-service';
import { D1CoachRepository } from '@/src/infrastructure/d1-coach';
import { D1LedgerRepository } from '@/src/infrastructure/d1-ledger';
import { GroqFinancialCoach } from '@/src/infrastructure/groq-financial-coach';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import {database} from '@/src/infrastructure/database';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';

export const runtime='nodejs';

function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
function errorResponse(error:unknown){
 if(error instanceof SyntaxError)return json({error:'La consulta no tiene un formato válido.'},400);
 if(error instanceof ZodError)return json({error:'Escribe una consulta de hasta 2000 caracteres y selecciona un mes válido.'},400);
 if(error instanceof CoachError)return json({error:error.message},error.status);
 if(error instanceof AuthError)return json({error:error.message},error.status);
 // Never log prompts, credentials or raw provider responses.
 console.error('Financial coach request failed');
 return json({error:'No se pudo completar la consulta. Tu mensaje se conserva; intenta nuevamente.'},503);
}
export async function GET(request:Request){
 try{
  const db=database();const user=await new D1AuthRepository(db).requireUser(request);const query=new URL(request.url).searchParams;const month=monthSchema.parse(query.get('month'));const include=query.get('context')==='true';
  const repository=new D1CoachRepository(db,user.id);const conversationId=await repository.latest(month,include);
  const turns=conversationId?await repository.history(conversationId,month,include):[];
  return json({configured:Boolean(process.env.GROQ_API_KEY?.trim()),conversationId,turns});
 }catch(error){return errorResponse(error)}
}
export async function POST(request:Request){
 if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);
 if(!process.env.GROQ_API_KEY?.trim())return json({error:'Falta configurar la clave de Groq API en el servidor para activar el chat.'},503);
 try{
  const text=await request.text();if(text.length>12000)return json({error:'La consulta es demasiado larga.'},413);
  const body=JSON.parse(text);const db=database();const user=await new D1AuthRepository(db).requireUser(request);
  const service=new CoachService(new D1CoachRepository(db,user.id),new D1LedgerRepository(db,user.id,false),new GroqFinancialCoach(process.env.GROQ_API_KEY,process.env.GROQ_MODEL||'llama-3.3-70b-versatile'));
  return json(await service.ask(body));
 }catch(error){return errorResponse(error)}
}

export async function DELETE(request:Request){
 if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const db=database();const user=await new D1AuthRepository(db).requireUser(request);const raw=await request.text();if(raw.length>100)return json({error:'Solicitud inválida.'},400);
  const body=JSON.parse(raw);
  if(body?.confirm!=='delete-all-chat-history')return json({error:'Confirma la eliminación del historial.'},400);
  const cleared=await new D1CoachRepository(db,user.id).clearHistory(Date.now());
  if(!cleared)return json({error:'Hay una consulta en proceso. Espera a que termine y vuelve a limpiar el chat.'},409);
  return json({cleared:true});
 }catch(error){return errorResponse(error)}
}
