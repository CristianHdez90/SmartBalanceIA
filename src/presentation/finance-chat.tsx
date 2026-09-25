'use client';
import './finance-chat.css';
import InitialFinancialSummary from './initial-financial-summary';
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, MessageCircle, RotateCcw, Trash2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { money, type Ledger } from '@/src/domain/finance';
import { colombiaDate, financialContext, type CoachTurn } from '@/src/domain/coach';

const suggestions = [
  {title:'Organizar mi próximo ingreso',text:'Ayúdame a organizar mi próximo ingreso. Usa primero los datos registrados y pregunta solo por los datos que falten para distribuirlo entre obligaciones, gastos básicos y ahorro?'},
  {title:'Crear un plan de 30 días',text:'Quiero un plan de 30 días para mejorar mis finanzas, con acciones semanales y una meta que pueda medir.'},
  {title:'Reducir mis deudas',text:'¿Cómo puedo priorizar mis deudas sin dejar de cubrir lo esencial? Usa los saldos, tasas y cuotas registrados para un análisis inicial y pregunta únicamente por información faltante.'},
  {title:'Empezar un fondo de emergencia',text:'Quiero empezar un fondo de emergencia. Ayúdame a definir una meta realista según mi situación.'},
];
type Connection = { configured:boolean;conversationId:string|null;turns:CoachTurn[] };
export default function FinanceChat({month,monthLabel,ledger}:{month:string;monthLabel:string;ledger:Ledger}) {
  const [confirmClear,setConfirmClear]=useState(false);
  const [clearing,setClearing]=useState(false);
  const [notice,setNotice]=useState('');
  const [includeContext,setIncludeContext]=useState(false);
  const [summaryPrepared,setSummaryPrepared]=useState(false);
  const summaryPanel=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const [configured,setConfigured]=useState(false);
  const [conversationId,setConversationId]=useState('');
  const [turns,setTurns]=useState<CoachTurn[]>([]);
  const [draft,setDraft]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [reload,setReload]=useState(0);
  const alive=useRef(true);
  const requestId=useRef<string|null>(null);
  const bottom=useRef<HTMLDivElement>(null);
  const scrollAfterSend=useRef(false);
  const context=financialContext(ledger,month,colombiaDate());

  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setTurns([]);setConfigured(false);setConversationId('');requestId.current=null;
    fetch(`/api/coach?month=${encodeURIComponent(month)}&context=${includeContext}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json() as Connection & {error?:string};if(!response.ok)throw new Error(data.error);return data})
      .then(data=>{if(controller.signal.aborted)return;setConfigured(data.configured);setConversationId(data.conversationId??crypto.randomUUID());setTurns(data.turns)})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message||'No se pudo cargar el chat.')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[month,includeContext,reload]);
  useEffect(()=>{if(scrollAfterSend.current){scrollAfterSend.current=false;bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'})}},[turns]);

  useEffect(()=>{if(summaryPrepared&&!loading)summaryPanel.current?.scrollIntoView({block:'start',behavior:'smooth'})},[summaryPrepared,loading]);

  function freshConversation(){setConversationId(crypto.randomUUID());setTurns([]);setError('');requestId.current=null;}
  async function clearHistory(){
    if(clearing||sending)return;
    setClearing(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/coach',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'delete-all-chat-history'})});
      const result=await response.json() as {cleared?:boolean;error?:string};if(!response.ok||!result.cleared)throw new Error(result.error||'No se pudo limpiar el historial.');
      if(alive.current){setTurns([]);setDraft('');setSummaryPrepared(false);setIncludeContext(false);setConversationId(crypto.randomUUID());requestId.current=null;scrollAfterSend.current=false;setConfirmClear(false);setNotice('Historial eliminado. Ya puedes empezar desde cero.');setReload(value=>value+1);}
    }catch(e){if(alive.current){setError((e as Error).message);setConfirmClear(false)}}
    finally{if(alive.current)setClearing(false)}
  }
  async function send(event:React.FormEvent){
    event.preventDefault();if(sending||loading||clearing||!configured||!draft.trim()||!conversationId)return;
    const question=draft.trim();requestId.current??=crypto.randomUUID();setSending(true);setError('');
    try{
      const response=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,conversationId,month,includeContext,question})});
      const result=await response.json() as CoachTurn & {error?:string};
      if(!response.ok){if(response.status!==425)requestId.current=null;throw new Error(result.error??'No se pudo obtener una respuesta.')}
      if(alive.current){scrollAfterSend.current=true;setTurns(previous=>[...previous.filter(t=>t.id!==result.id),result].slice(-6));setDraft('');requestId.current=null;}
    }catch(e){if(alive.current)setError((e as Error).message||'No se pudo conectar. Tu mensaje sigue disponible para reintentar.')}
    finally{if(alive.current)setSending(false)}
  }

  return <section className="finance-chat" aria-label="Asistente de finanzas">
    <div className="chat-heading"><span className="chat-avatar"><Bot size={24}/></span><div><h2>Tu asistente financiero</h2><p>Presupuesto, hábitos y planes que puedas poner en práctica.</p></div><button className="text-button" disabled={sending||loading} onClick={freshConversation}><RotateCcw size={15}/> Nueva conversación</button><button type="button" className="text-button clear-chat-button" disabled={sending||loading||clearing} onClick={()=>setConfirmClear(true)}><Trash2 size={15}/> Limpiar todo el chat</button></div>{notice&&<p className="chat-clear-notice" role="status">{notice}</p>}
    <div className="chat-context"><div className="chat-context-title"><ShieldCheck size={18}/><span className="chat-context-label" id="share-month-label">Incluir mi resumen de {monthLabel}</span><button type="button" id="share-month" className="chat-context-toggle" aria-labelledby="share-month-label" aria-pressed={includeContext} disabled={sending||loading} onClick={()=>setIncludeContext(value=>!value)}>{includeContext?"✓ Activado":"Activar resumen"}</button></div><p>{includeContext?'Al enviar, compartirás con Groq importes, saldos de deuda y tasas que hayas registrado, categorías y vencimientos del mes, con etiquetas como “Crédito de vivienda” o “Tarjeta de crédito Chevignon”, sin números de cuenta ni notas.':'Las consultas generales no incluyen automáticamente tus registros financieros.'} Tus mensajes y el contexto reciente de esta conversación se enviarán a Groq para responder.</p><button type="button" className="secondary chat-initial-summary" disabled={sending||loading} onClick={()=>{setSummaryPrepared(true);setIncludeContext(true);summaryPanel.current?.scrollIntoView({block:'start',behavior:'smooth'});setDraft("Con el resumen actual de mis registros, dame un diagnóstico financiero inicial: ingresos, cuotas, pagos, pendientes, vencimientos y deudas con saldo y tasas conocidos. Usa los datos que ya tienes y pregunta solo por los que falten. No supongas que el disponible registrado es ahorro.");requestId.current=null;}}>Preparar resumen inicial con mis datos</button><p className="chat-summary-help">Muestra un resumen en pantalla y prepara una consulta. El análisis de IA se solicita con «Enviar consulta».</p>
    {includeContext&&<details><summary>Ver el resumen y las referencias</summary><div className="chat-snapshot"><span>Ingresos registrados <b>{money(context.recordedIncome)}</b></span><span>Gastos diarios <b>{money(context.recordedDailyExpenses)}</b></span><span>Pendiente conocido <b>{money(context.pendingKnownAmounts)}</b></span><span>Disponible registrado <b>{money(context.recordedAvailable)}</b></span></div><p>{context.unknownAmounts} valores sin definir. Incluye los gastos diarios registrados agrupados por categoría, sin compartir sus descripciones. Los saldos de deuda y tasas se incluyen cuando están registrados; no se envían enlaces bancarios.</p><ul className="chat-references">{ledger.obligations.slice(0,100).map((o,i)=><li key={o.id}><b>Obligación {i+1}</b>: {o.name} <small>(se envía: {context.obligations[i].label}; el nombre completo solo se muestra aquí)</small></li>)}</ul></details>}</div>
    {summaryPrepared&&<div ref={summaryPanel} className="initial-summary-panel"><InitialFinancialSummary context={context}/><button type="button" className="primary" disabled={sending||loading} onClick={()=>{composer.current?.focus({preventScroll:true});composer.current?.scrollIntoView({block:"center",behavior:"smooth"})}}>Revisar consulta preparada ↓</button></div>}
    {loading?<div className="chat-loading"><LoaderCircle className="spin" size={20}/> Cargando conversación…</div>:!configured&&<div className="chat-setup" role="status"><b>Falta activar la conexión de IA</b><p>Configura la clave de Groq API en el servidor. Después podrás enviar preguntas y recibir planes personalizados aquí.</p><button className="secondary" onClick={()=>setReload(v=>v+1)}>Comprobar conexión</button></div>}
    {!loading&&<div className="chat-welcome"><MessageCircle size={27}/><h3>¿Qué te gustaría mejorar?</h3><p>Empieza con una pregunta o elige una idea.</p><div className="chat-suggestions">{suggestions.map(s=><button key={s.title} disabled={sending||clearing} onClick={()=>{setDraft(s.text);requestId.current=null;}}>{s.title}<span>↗</span></button>)}</div></div>}
    <div className="chat-messages" aria-label="Conversación guardada">{turns.map(turn=><div key={turn.id} className="chat-turn"><article className="chat-message chat-user"><span>Tú</span><p>{turn.question}</p></article><article className="chat-message chat-assistant"><span><Bot size={15}/> Asistente IA</span><p>{turn.answer}</p><small>{new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}).format(turn.createdAt)}{includeContext?' · Basado en los datos disponibles al consultar':''}</small></article></div>)}<div ref={bottom}/></div>
    {sending&&<p className="chat-loading" role="status"><LoaderCircle className="spin" size={18}/> Preparando una respuesta…</p>}
    {error&&<div className="error" role="alert">{error}<button className="text-button" disabled={sending} onClick={()=>setReload(v=>v+1)}>Actualizar</button></div>}
    <form onSubmit={send} className="chat-composer"><label htmlFor="finance-question">Tu consulta</label><Textarea ref={composer} id="finance-question" value={draft} disabled={sending} maxLength={2000} onChange={e=>{setDraft(e.target.value);requestId.current=null}} placeholder="Por ejemplo: ¿cómo distribuyo mi próximo ingreso sin atrasarme en los pagos?" rows={3}/><div className="chat-send-row"><small>{draft.length}/2000 · {includeContext?'Con resumen del mes':'Consulta general'}</small><button className="primary" disabled={loading||sending||clearing||!configured||!conversationId||!draft.trim()}>{sending?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>} {sending?'Consultando…':'Enviar consulta'}</button></div></form>
    <p className="chat-footnote">Orientación educativa generada por IA; revisa los supuestos antes de tomar decisiones. El chat no realiza pagos ni modifica tu contabilidad. La conversación se guarda en tu plataforma y muestra las últimas 6 consultas. Las respuestas anteriores no se recalculan: vuelve a consultar después de cambiar movimientos.</p>
    <AlertDialog open={confirmClear} onOpenChange={value=>{if(!clearing)setConfirmClear(value)}}><AlertDialogContent className="clear-chat-dialog"><AlertDialogHeader><AlertDialogTitle>¿Eliminar todo el historial del chat?</AlertDialogTitle><AlertDialogDescription>Se eliminarán permanentemente todas las preguntas y respuestas guardadas en esta plataforma, de todos los meses y conversaciones, con y sin resumen. También se vaciará el borrador. Tus obligaciones, ingresos, pagos y reportes se conservarán. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={clearing} onClick={event=>{event.preventDefault();void clearHistory()}}>{clearing?'Eliminando…':'Sí, eliminar todo el chat'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
