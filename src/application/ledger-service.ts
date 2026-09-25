import { z } from 'zod';
import { dailyExpenseCategories, type LedgerRepository } from '../domain/finance';
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const amount = z.number().int().positive().max(999999999999);
const date = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/).refine(s => { const d = new Date(s+'T12:00:00Z'); return !isNaN(d.valueOf()) && d.toISOString().slice(0,10) === s; },'Fecha inválida');
const day=z.number().int().min(1).max(31).nullable().optional();
const rate=z.number().finite().min(0).max(100000).nullable().default(null);
const bankingUrl=z.string().trim().max(500).refine(value=>{if(!value)return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}},'Usa un enlace HTTPS válido sin credenciales').default('');
export const commandSchema = z.discriminatedUnion('action',[
 z.object({action:z.literal('initialize'),month:monthSchema}),
 z.object({action:z.literal('movement'),month:monthSchema,id:z.string().uuid(),kind:z.enum(['income','payment']),obligationId:z.string().max(200).nullable(),amount,date,description:z.string().trim().min(1).max(160)}),
 z.object({action:z.literal('obligation'),applyFutureAmount:z.boolean().default(false),month:monthSchema,id:z.string().min(1).max(200),name:z.string().trim().min(1).max(120),category:z.enum(['Créditos','Tarjetas','Hogar','Seguros','Otros']),amount:amount.nullable(),note:z.string().max(300),cutoffDate:date.nullable().default(null),dueDate:date.nullable().default(null),cutoffDay:day,dueDay:day,totalDebt:z.number().int().min(0).max(999999999999).nullable().default(null),bank:z.string().trim().max(120).default(''),bankingUrl,interestMV:rate,interestEA:rate}),
 z.object({action:z.literal('removeMovement'),month:monthSchema,id:z.string().min(1).max(200)}),
 z.object({action:z.literal('expense'),month:monthSchema,id:z.string().uuid(),category:z.enum(dailyExpenseCategories),amount,date,description:z.string().trim().min(1).max(160)}),
 z.object({action:z.literal('removeExpense'),month:monthSchema,id:z.string().uuid()}),
]);
export class LedgerService {
 constructor(private readonly repository: LedgerRepository) {}
 async execute(input: unknown) { const c = commandSchema.parse(input);
  if(c.action === 'initialize') await this.repository.initialize(c.month);
  if(c.action === 'movement') { if(!c.date.startsWith(c.month)) throw new Error('La fecha debe pertenecer al mes seleccionado.'); if(c.kind === 'payment' && !c.obligationId) throw new Error('Selecciona una obligación.'); await this.repository.addMovement({...c,obligationId:c.kind === 'income' ? null : c.obligationId}); }
  if(c.action === 'obligation') await this.repository.saveObligation(c,c.applyFutureAmount&&['Créditos','Tarjetas'].includes(c.category));
  if(c.action === 'removeMovement') await this.repository.removeMovement(c.id,c.month);
  if(c.action === 'expense') { if(!c.date.startsWith(c.month)) throw new Error('La fecha debe pertenecer al mes seleccionado.'); await this.repository.saveExpense(c); }
  if(c.action === 'removeExpense') await this.repository.removeExpense(c.id,c.month);
  return this.repository.read(c.month);
 }
}
