import { ZodError } from 'zod';
import { goalCommand, GoalConflictError } from '@/src/domain/goals';
import { FinancialGoalsRepository } from '@/src/infrastructure/financial-goals';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import { database, DatabaseError } from '@/src/infrastructure/database';
import { isAllowedOrigin } from '@/src/infrastructure/request-origin';

export const runtime = 'nodejs';
async function repository(request: Request) {
  const db = database();
  const user = await new D1AuthRepository(db).requireUser(request);
  return new FinancialGoalsRepository(db, user.id);
}
function failure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: 'Revisa el nombre, la fecha y los montos. Usa pesos enteros; el objetivo debe ser mayor que cero.' }, { status: 400 });
  if (error instanceof GoalConflictError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof DatabaseError) return Response.json({ error: error.message }, { status: 503 });
  console.error('Goals request failed', error);
  return Response.json({ error: 'No se pudieron guardar o cargar tus metas. Intenta nuevamente.' }, { status: 503 });
}
export async function GET(request: Request) {
  try { return Response.json({ goals: await (await repository(request)).list() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  try {
    const repo = await repository(request);
    return Response.json({ goals: await repo.execute(goalCommand.parse(await request.json())) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
