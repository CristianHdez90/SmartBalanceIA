import { z, ZodError } from 'zod';
import { monthSchema } from '@/src/application/ledger-service';
import { BackupError, decodeBackup, encodeBackup, MAX_BACKUP_BYTES } from '@/src/domain/month-backup';
import { MonthBackups } from '@/src/infrastructure/month-backups';
import { exportCsv, exportExcel } from '@/src/infrastructure/month-export';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { database, DatabaseError } from '@/src/infrastructure/database';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';
export const runtime='nodejs';
const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function repository(request:Request){const db=database();const user=await new D1AuthRepository(db).requireUser(request);const scope=z.enum(['ledger','expenses']).parse(new URL(request.url).searchParams.get('scope')??'ledger');return new MonthBackups(db,user.id,scope);}
function failure(error:unknown){
 if(error instanceof AuthError||error instanceof BackupError)return Response.json({error:error.message},{status:error.status,headers:noStore});
 if(error instanceof ZodError||error instanceof SyntaxError)return Response.json({error:'Revisa el mes, formato o archivo de respaldo seleccionado.'},{status:400,headers:noStore});
 if(error instanceof DatabaseError)return Response.json({error:error.message},{status:503,headers:noStore});
 console.error('Monthly backup failed',error instanceof Error?error.name:'Unknown');return Response.json({error:'No se pudo completar el respaldo o la restauración. Intenta nuevamente.'},{status:503,headers:noStore});
}
export async function GET(request:Request){try{
 const repo=await repository(request);const query=new URL(request.url).searchParams;const month=monthSchema.parse(query.get('month'));const format=z.enum(['xlsx','csv','sql']).parse(query.get('format'));
 const b=await repo.read(month);const data=format==='sql'?encodeBackup(b):format==='csv'?exportCsv(b):await exportExcel(b);
 if(format==='sql'&&Buffer.byteLength(data as string,'utf8')>MAX_BACKUP_BYTES)throw new BackupError('Este mes supera el tamaño máximo de respaldo SQL (4 MB).');
 const type={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv; charset=utf-8',sql:'application/sql; charset=utf-8'}[format];
 return new Response(typeof data==='string'?data:new Uint8Array(data),{headers:{...noStore,'Content-Type':type,'Content-Disposition':`attachment; filename="mi-balance-${month}.${format}"`}});
 }catch(error){return failure(error);}}
const restoreRequest=z.object({action:z.enum(['preview','restore']),sql:z.string().max(MAX_BACKUP_BYTES),revision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
async function limitedBody(request:Request){
 if(Number(request.headers.get('content-length')??0)>MAX_BACKUP_BYTES+512*1024)throw new BackupError('El archivo supera el tamaño permitido.',413);
 const reader=request.body?.getReader();if(!reader)throw new BackupError('Selecciona un respaldo SQL.');
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX_BACKUP_BYTES+512*1024){await reader.cancel();throw new BackupError('El archivo supera el tamaño permitido.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(request:Request){
 if(!isAllowedOrigin(request))return Response.json({error:'Origen no permitido'},{status:403,headers:noStore});
 try{const repo=await repository(request);const input=restoreRequest.parse(await limitedBody(request));const b=decodeBackup(input.sql);
 if(input.action==='preview')return Response.json(await repo.preview(b),{headers:noStore});
 if(!input.revision)throw new BackupError('Revisa la vista previa del respaldo antes de restaurar.');
 return Response.json(await repo.restore(b,input.revision),{headers:noStore});
 }catch(error){return failure(error);}
}
