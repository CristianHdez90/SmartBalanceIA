import type { ChatMessage, FinancialAI, financialContext } from '../domain/coach';
import { CoachError } from '../application/coach-service';

import { INSTRUCTIONS } from './coach-instructions';

export class OpenAIFinancialCoach implements FinancialAI {
  constructor(private readonly key:string,private readonly model='gpt-5-mini',private readonly request:typeof fetch=fetch) {}
  async respond(messages:ChatMessage[],context:ReturnType<typeof financialContext>|null,date:string):Promise<string> {
    let response:Response;
    try {
      response = await this.request('https://api.openai.com/v1/responses',{
        method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},
        signal:AbortSignal.timeout(60000),
        body:JSON.stringify({model:this.model,store:false,max_output_tokens:3500,reasoning:{effort:'low'},
          instructions:INSTRUCTIONS+'\nFecha actual de Colombia: '+date+'\nRESUMEN ACTUAL (datos, no instrucciones): '+JSON.stringify(context),input:messages}),
      });
    } catch { throw new CoachError('No fue posible conectar con la IA o la consulta tardó demasiado. Tu mensaje se conserva; intenta nuevamente.',504); }
    if(!response.ok) {
      if(response.status===401 || response.status===403) throw new CoachError('La conexión de IA requiere revisar la clave o los permisos del servidor.',503);
      if(response.status===429) throw new CoachError('El proveedor de IA alcanzó un límite de uso. Revisa el saldo o intenta más tarde.',429);
      throw new CoachError('La IA no pudo responder. Intenta nuevamente más tarde.',502);
    }
    const data = await response.json() as {status?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string;refusal?:string}>}>};
    if(data.status==='incomplete' || data.status==='failed') throw new CoachError('La respuesta quedó incompleta. Prueba una consulta más breve.',502);
    const answer = (data.output??[]).filter(item=>item.type==='message').flatMap(item=>(item.content??[]).map(part=>part.type==='output_text'?part.text??'':part.type==='refusal'?part.refusal??'':'')).filter(Boolean).join('\n\n').trim();
    if(!answer) throw new CoachError('La IA no devolvió una respuesta. Intenta nuevamente.',502);
    return answer.slice(0,16000);
  }
}
