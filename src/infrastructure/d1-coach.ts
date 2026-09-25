import type { CoachRepository, CoachTurn } from '../domain/coach';
import type {DatabaseClient} from './database';
const columns='id,conversation_id AS conversationId,month,include_context AS includeContext,question,answer,status,created_at AS createdAt';
function normalize(row:CoachTurn):CoachTurn { return {...row,includeContext:Boolean(row.includeContext)}; }
export class D1CoachRepository implements CoachRepository {
 constructor(private readonly db:DatabaseClient,private readonly userId='legacy'){}
 async clearHistory(now:number) {
  const cutoff=now-120000;
  const guard="NOT EXISTS(SELECT 1 FROM coach_turns WHERE user_id=? AND status='pending' AND created_at>?)";
  const results=await this.db.batch([
   this.db.prepare("SELECT COUNT(*) AS pending FROM coach_turns WHERE user_id=? AND status='pending' AND created_at>?").bind(this.userId,cutoff),
   this.db.prepare('INSERT OR IGNORE INTO coach_usage (id,user_id,created_at) SELECT id,user_id,created_at FROM coach_turns WHERE user_id=? AND '+guard).bind(this.userId,this.userId,cutoff),
   this.db.prepare('DELETE FROM coach_turns WHERE user_id=? AND '+guard).bind(this.userId,this.userId,cutoff)
  ]);
  return Number((results[0].results[0] as {pending:number}).pending)===0;
 }
 async find(id:string) { const row=await this.db.prepare(`SELECT ${columns} FROM coach_turns WHERE user_id=? AND id=?`).bind(this.userId,id).first<CoachTurn>();return row?normalize(row):null; }
 async history(id:string,month:string,include:boolean) {
   const result=await this.db.prepare(`SELECT ${columns} FROM coach_turns WHERE user_id=? AND conversation_id=? AND month=? AND include_context=? AND status='complete' ORDER BY created_at DESC,rowid DESC LIMIT 6`).bind(this.userId,id,month,Number(include)).all<CoachTurn>();
   return result.results.map(normalize).reverse();
 }
 async latest(month:string,include:boolean) { const row=await this.db.prepare("SELECT conversation_id AS id FROM coach_turns WHERE user_id=? AND month=? AND include_context=? AND status='complete' ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(this.userId,month,Number(include)).first<{id:string}>();return row?.id??null; }
 async reserve(turn:CoachTurn,dayStart:number) {
   const result=await this.db.prepare(`INSERT OR IGNORE INTO coach_turns (user_id,id,conversation_id,month,include_context,question,answer,status,created_at)
   SELECT ?,?,?,?,?,?,NULL,'pending',? WHERE ((SELECT COUNT(*) FROM coach_turns WHERE user_id=? AND created_at>=?)+(SELECT COUNT(*) FROM coach_usage WHERE user_id=? AND created_at>=?))<30
   AND NOT EXISTS (SELECT 1 FROM coach_turns WHERE user_id=? AND conversation_id=? AND status='pending' AND created_at>?)
   AND NOT EXISTS (SELECT 1 FROM coach_turns WHERE user_id=? AND conversation_id=? AND (month<>? OR include_context<>?))`).bind(this.userId,turn.id,turn.conversationId,turn.month,Number(turn.includeContext),turn.question,turn.createdAt,this.userId,dayStart,this.userId,dayStart,this.userId,turn.conversationId,turn.createdAt-120000,this.userId,turn.conversationId,turn.month,Number(turn.includeContext)).run();
   return Boolean(result.meta.changes);
 }
 async complete(id:string,answer:string) {await this.db.prepare("UPDATE coach_turns SET status='complete',answer=? WHERE user_id=? AND id=? AND status='pending'").bind(answer,this.userId,id).run();}
 async fail(id:string) {await this.db.prepare("UPDATE coach_turns SET status='failed' WHERE user_id=? AND id=? AND status='pending'").bind(this.userId,id).run();}
}
