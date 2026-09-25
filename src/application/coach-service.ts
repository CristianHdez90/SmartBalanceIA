import { z } from 'zod';
import { monthSchema } from './ledger-service';
import { colombiaDate, financialContext, turnMessages, type CoachRepository, type FinancialAI } from '../domain/coach';
import type { LedgerRepository } from '../domain/finance';

export const coachRequest = z.object({id:z.string().uuid(),conversationId:z.string().uuid(),month:monthSchema,includeContext:z.boolean(),question:z.string().trim().min(1).max(2000)}).strict();
export class CoachError extends Error { constructor(message:string,public readonly status:number){super(message)} }
export class CoachService {
  constructor(private readonly chats:CoachRepository, private readonly ledger:LedgerRepository, private readonly ai:FinancialAI, private readonly now:()=>Date=()=>new Date()) {}
  async ask(input:unknown) {
    const request = coachRequest.parse(input);
    const previous = await this.chats.find(request.id);
    if(previous) {
      if(previous.conversationId!==request.conversationId || previous.month!==request.month || previous.includeContext!==request.includeContext || previous.question!==request.question) throw new CoachError('La solicitud cambió. Envía una nueva consulta.',409);
      if(previous.status==='complete') return previous;
      if(previous.status==='pending' && this.now().getTime()-previous.createdAt<120000) throw new CoachError('La consulta sigue en proceso. Espera unos segundos antes de reintentar.',425);
      if(previous.status==='pending') await this.chats.fail(previous.id);
      throw new CoachError('La consulta anterior no se completó. Envía nuevamente tu mensaje.',409);
    }
    const date = colombiaDate(this.now());
    const history = await this.chats.history(request.conversationId,request.month,request.includeContext);
    const context = request.includeContext ? financialContext(await this.ledger.read(request.month),request.month,date) : null;
    const turn = {...request,answer:null,status:'pending' as const,createdAt:this.now().getTime()};
    const accepted=await this.chats.reserve(turn,Date.parse(date+'T00:00:00-05:00'));
    if(!accepted) throw new CoachError('Alcanzaste el límite de 30 consultas diarias o ya hay una consulta en proceso. Intenta más tarde.',429);
    try {
      const answer = await this.ai.respond([...turnMessages(history),{role:'user',content:request.question}],context,date);
      await this.chats.complete(request.id,answer);
      return {...turn,answer,status:'complete' as const};
    } catch(error) {
      await this.chats.fail(request.id).catch(()=>{});
      throw error;
    }
  }
}
