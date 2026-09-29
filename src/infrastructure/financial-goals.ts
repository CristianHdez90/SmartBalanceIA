import type { DatabaseClient } from './database';
import { GoalConflictError, type FinancialGoal, type GoalCommand } from '../domain/goals';

export class FinancialGoalsRepository {
  constructor(private readonly db: DatabaseClient, private readonly userId: string) {}
  async list(): Promise<FinancialGoal[]> {
    return (await this.db.prepare('SELECT id,name,target,saved,due_date AS dueDate,icon,color,version,archived FROM financial_goals WHERE user_id=? ORDER BY archived,due_date,created_at,id').bind(this.userId).all<FinancialGoal>()).results;
  }
  async execute(command: GoalCommand) {
    let result;
    if (command.action === 'create') {
      result = await this.db.prepare('INSERT OR IGNORE INTO financial_goals (user_id,id,name,target,saved,due_date,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(this.userId, command.id, command.name, command.target, command.saved, command.dueDate, command.icon, command.color, Date.now(), Date.now()).run();
    } else if (command.action === 'update') {
      result = await this.db.prepare('UPDATE financial_goals SET name=?,target=?,saved=?,due_date=?,icon=?,color=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=? AND archived=0')
        .bind(command.name, command.target, command.saved, command.dueDate, command.icon, command.color, Date.now(), this.userId, command.id, command.version).run();
    } else {
      result = await this.db.prepare('UPDATE financial_goals SET archived=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?')
        .bind(command.archived ? 1 : 0, Date.now(), this.userId, command.id, command.version).run();
    }
    if (!result.meta.changes) throw new GoalConflictError();
    return this.list();
  }
}
