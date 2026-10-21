import { ZodError } from 'zod';
import { reminderCommand, ReminderConflict } from '@/src/domain/reminders';
import { RemindersRepository } from '@/src/infrastructure/reminders';
import { database } from '@/src/infrastructure/database';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';

export const runtime = 'nodejs';
async function repo(request: Request) {
  const db = database(), user = await new D1AuthRepository(db).requireUser(request);
  return new RemindersRepository(db, user.id);
}
function failure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: 'Revisa los campos, días y vigencia de la promoción.' }, { status: 400 });
  if (error instanceof ReminderConflict) return Response.json({ error: error.message }, { status: 409 });
  console.error('Reminder request failed', error);
  return Response.json({ error: 'No se pudieron cargar o guardar los recordatorios. Intenta nuevamente.' }, { status: 503 });
}
export async function GET(request: Request) {
  try { return Response.json(await (await repo(request)).read(), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  try { return Response.json(await (await repo(request)).execute(reminderCommand.parse(await request.json())), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); }
}
