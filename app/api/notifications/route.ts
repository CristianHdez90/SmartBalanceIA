import { z } from 'zod';
import { database, DatabaseError } from '@/src/infrastructure/database';
import { AuthError,D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';
import { NotificationInboxRepository } from '@/src/infrastructure/notification-inbox';
import { RemindersRepository } from '@/src/infrastructure/reminders';

export const runtime='nodejs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function failure(e:unknown) {
  if(e instanceof DatabaseError&&e.code==='SCHEMA_MISSING')return json({error:'La bandeja necesita una actualización de la base de datos. Falta aplicar la migración de notificaciones (0017).'},503);
  if(e instanceof AuthError)return json({error:e.message},e.status);
  if(e instanceof z.ZodError||e instanceof SyntaxError)return json({error:'Notificación no válida.'},400);
  return json({error:'No se pudo actualizar la bandeja de notificaciones.'},503);
}
export async function GET(request:Request) {
  try {
    const db=database(),user=await new D1AuthRepository(db).requireUser(request);
    const data=await new RemindersRepository(db,user.id).read();
    return json({...await new NotificationInboxRepository(db,user.id).refresh(data.todayNotifications),repeatSeconds:data.settings.repeatSeconds});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  if(!isAllowedOrigin(request))return json({error:'Origen no permitido'},403);
  try {
    const db=database(),user=await new D1AuthRepository(db).requireUser(request);
    const {id}=z.object({id:z.string().min(1).max(200)}).strict().parse(await request.json());
    const repo=new NotificationInboxRepository(db,user.id);
    if(!await repo.markRead(id))return json({error:'La notificación ya no existe.'},404);
    return json(await repo.list());
  }catch(e){return failure(e);}
}
