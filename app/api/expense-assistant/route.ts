import {z,ZodError} from 'zod';
import {monthSchema} from '@/src/application/ledger-service';
import {colombiaDate} from '@/src/domain/coach';
import {AuthError,D1AuthRepository} from '@/src/infrastructure/d1-auth';
import {database,DatabaseError} from '@/src/infrastructure/database';
import {ExpenseInterpretationError,GroqExpenseInterpreter} from '@/src/infrastructure/groq-expense-interpreter';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';

export const runtime='nodejs';
const inputSchema=z.object({month:monthSchema,transcript:z.string().trim().min(3).max(1200)}).strict();
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request){
 if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);
 if(!process.env.GROQ_API_KEY?.trim())return json({error:'Falta configurar Groq para interpretar gastos por voz.'},503);
 try{
  const raw=await request.text();if(raw.length>3000)return json({error:'El dictado es demasiado largo.'},413);
  const input=inputSchema.parse(JSON.parse(raw));const db=database();const user=await new D1AuthRepository(db).requireUser(request);await new D1AuthRepository(db).limited(user.id,'expense-assistant',30,3600000);
  const currentDate=colombiaDate();const defaultDate=currentDate.startsWith(input.month)?currentDate:input.month+'-01';
  return json(await new GroqExpenseInterpreter(process.env.GROQ_API_KEY,process.env.GROQ_MODEL||'llama-3.3-70b-versatile').interpret(input.transcript,input.month,currentDate,defaultDate));
 }catch(error){
  if(error instanceof SyntaxError||error instanceof ZodError)return json({error:'Revisa el texto dictado y el mes seleccionado.'},400);
  if(error instanceof AuthError||error instanceof ExpenseInterpretationError)return json({error:error.message},error.status);
  if(error instanceof DatabaseError)return json({error:error.message,code:error.code},503);
  console.error('Expense assistant request failed');return json({error:'No se pudo interpretar el dictado. Intenta nuevamente.'},503);
 }
}
