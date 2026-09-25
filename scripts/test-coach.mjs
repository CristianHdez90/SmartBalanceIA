import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import ts from 'typescript';

const output=resolve('.sites-runtime/coach-tests');
for(const file of ['domain/finance','domain/payment-report','domain/seed','domain/coach','application/ledger-service','application/coach-service','infrastructure/d1-ledger','infrastructure/d1-coach','infrastructure/openai-financial-coach','infrastructure/coach-instructions','infrastructure/groq-financial-coach']){
 const source=readFileSync(resolve('src',file+'.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '(\.\.?\/[^']+)'/g,"from '$1.js'");
 mkdirSync(dirname(resolve(output,file+'.js')),{recursive:true});writeFileSync(resolve(output,file+'.js'),js);
}
const load=file=>import(pathToFileURL(resolve(output,file+'.js')));
const {financialContext,colombiaDate,obligationLabel}=await load('domain/coach');
const {CoachService}=await load('application/coach-service');
const {D1CoachRepository}=await load('infrastructure/d1-coach');
const {D1LedgerRepository}=await load('infrastructure/d1-ledger');
const {OpenAIFinancialCoach}=await load('infrastructure/openai-financial-coach');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(resolve('drizzle',file),'utf8'));
function prepare(query,args=[]){return {query,args,bind(...a){return prepare(query,a)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:r.changes},results:[]}}}}
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(/^SELECT/i.test(s.query.trim())?{results:sql.prepare(s.query).all(...s.args)}:{results:[],meta:{changes:sql.prepare(s.query).run(...s.args).changes}});sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
const ledger=new D1LedgerRepository(db),chats=new D1CoachRepository(db);
await ledger.initialize('2026-09');
const original=await ledger.read('2026-09');const context=financialContext(original,'2026-09','2026-09-23');
assert.equal(context.obligations.length,18);assert.equal(context.unknownAmounts,3);
for(const o of original.obligations){assert.ok(!JSON.stringify(context).includes(o.id));assert.ok(!JSON.stringify(context).includes('Importado de tu imagen'))}
assert.equal(colombiaDate(new Date('2026-09-23T02:00:00Z')),'2026-09-22');
let calls=0,captured;
const ai={async respond(messages,context,date){calls++;captured={messages,context,date};return 'Respuesta simulada de prueba.'}};
const now=()=>new Date('2026-09-23T18:00:00Z');
const service=new CoachService(chats,ledger,ai,now);
const input={id:crypto.randomUUID(),conversationId:crypto.randomUUID(),month:'2026-09',includeContext:false,question:'¿Cómo organizo un presupuesto?'};
const first=await service.ask(input);assert.equal(first.status,'complete');assert.equal(captured.context,null);assert.equal(calls,1);
assert.deepEqual(await service.ask(input),first);assert.equal(calls,1);
await assert.rejects(()=>service.ask({...input,question:'Otra pregunta'}),/solicitud cambió/);
await assert.rejects(()=>service.ask({...input,id:crypto.randomUUID(),question:' '.repeat(4)}));
await assert.rejects(()=>service.ask({...input,id:crypto.randomUUID(),question:'a'.repeat(2001)}));
await service.ask({...input,id:crypto.randomUUID(),question:'Amplía el primer paso.'});assert.equal(captured.messages.length,3);
assert.equal(await chats.latest('2026-09',true),null);assert.equal(await chats.latest('2026-09',false),input.conversationId);
assert.equal((await chats.history(input.conversationId,'2026-09',true)).length,0);
await assert.rejects(()=>service.ask({...input,id:crypto.randomUUID(),includeContext:true}),/límite/);
assert.equal(calls,2);
const contextual={...input,id:crypto.randomUUID(),conversationId:crypto.randomUUID(),includeContext:true};
await service.ask(contextual);assert.equal(captured.context.recordedPayments,0);
const testPayment={id:crypto.randomUUID(),month:'2026-09',kind:'payment',obligationId:original.obligations[0].id,amount:100,date:'2026-09-23',description:'Privado'};
await ledger.addMovement(testPayment);await service.ask({...contextual,id:crypto.randomUUID()});assert.equal(captured.context.recordedPayments,100);
await ledger.removeMovement(testPayment.id,'2026-09');await service.ask({...contextual,id:crypto.randomUUID()});assert.equal(captured.context.recordedPayments,0);
assert.ok(!JSON.stringify(captured.context).includes('Privado'));
const failing=new CoachService(chats,ledger,{async respond(){throw new Error('Simulated failure')}},now);
const failInput={...input,id:crypto.randomUUID(),conversationId:crypto.randomUUID()};
await assert.rejects(()=>failing.ask(failInput),/Simulated/);assert.equal((await chats.find(failInput.id)).status,'failed');
assert.equal((await chats.history(failInput.conversationId,failInput.month,false)).length,0);
const pending={...input,id:crypto.randomUUID(),conversationId:crypto.randomUUID(),status:'pending',answer:null,createdAt:now().getTime()};
assert.equal(await chats.reserve(pending,Date.parse('2026-09-23T00:00:00-05:00')),true);
await assert.rejects(()=>service.ask(pending),e=>e.status===425 || e.name==='ZodError');
await assert.rejects(()=>service.ask({id:pending.id,conversationId:pending.conversationId,month:pending.month,includeContext:false,question:pending.question}),e=>e.status===425);
let httpBody;
const provider=new OpenAIFinancialCoach('not-a-real-key','gpt-5-mini',async(url,request)=>{assert.equal(url,'https://api.openai.com/v1/responses');httpBody=JSON.parse(request.body);return Response.json({status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Plan de prueba'}]}]})});
assert.equal(await provider.respond([{role:'user',content:'Pregunta'}],null,'2026-09-23'),'Plan de prueba');
assert.equal(httpBody.store,false);assert.equal(httpBody.max_output_tokens,3500);assert.ok(!httpBody.tools);assert.ok(!httpBody.instructions.includes('not-a-real-key'));
const bad=new OpenAIFinancialCoach('fake','model',async()=>Response.json({error:{message:'secret internal diagnostic'}},{status:401}));
await assert.rejects(()=>bad.respond([],null,'2026-09-23'),e=>e.status===503&&!e.message.includes('secret'));
const truncated=new OpenAIFinancialCoach('fake','model',async()=>Response.json({status:'incomplete',output:[]}));
await assert.rejects(()=>truncated.respond([],null,'2026-09-23'),/incompleta/);
const attempts=sql.prepare('SELECT COUNT(*) AS n FROM coach_turns').get().n;
for(let i=attempts;i<30;i++)assert.equal(await chats.reserve({...pending,id:crypto.randomUUID(),conversationId:crypto.randomUUID()},Date.parse('2026-09-23T00:00:00-05:00')),true);
assert.equal(await chats.reserve({...pending,id:crypto.randomUUID(),conversationId:crypto.randomUUID()},Date.parse('2026-09-23T00:00:00-05:00')),false);
assert.deepEqual(await ledger.read('2026-09'),original);
console.log('OK: privacidad, consentimiento, datos actualizados tras reversión, historial, idempotencia, errores, límite diario y contrato Responses API. Sin llamadas reales ni datos de usuario.');

const {GroqFinancialCoach}=await load('infrastructure/groq-financial-coach');
const groq=new GroqFinancialCoach('test-key','llama-3.3-70b-versatile',async(url,request)=>{
 assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
 const body=JSON.parse(request.body);assert.equal(body.model,'llama-3.3-70b-versatile');assert.equal(body.messages[0].role,'system');assert.equal(body.messages[1].content,'Hola');assert.ok(body.messages[0].content.includes('RESUMEN ACTUAL'));assert.equal(request.headers.Authorization,'Bearer test-key');
 return Response.json({choices:[{finish_reason:'stop',message:{content:'Plan de prueba Groq'}}]});
});
assert.equal(await groq.respond([{role:'user',content:'Hola'}],null,'2026-09-23'),'Plan de prueba Groq');
for(const status of [401,403,429,500]){
 const failure=new GroqFinancialCoach('fake','model',async()=>Response.json({error:{message:'secret'}},{status}));
 await assert.rejects(()=>failure.respond([],null,'2026-09-23'),e=>e.status===(status===429?429:status===500?502:503)&&!e.message.includes('secret'));
}
for(const result of [{choices:[]},{choices:[{finish_reason:'length',message:{content:'Partial'}}]},{choices:[{message:{content:42}}]}]){
 await assert.rejects(()=>new GroqFinancialCoach('fake','model',async()=>Response.json(result)).respond([],null,'2026-09-23'),e=>e.status===502);
}
console.log('OK: contrato Groq, mensajes, autenticación, cuotas y respuestas incompletas.');

assert.equal(obligationLabel('Crédito Vivienda 2699'),'Crédito de vivienda');
assert.equal(obligationLabel('Tarjeta Crédito Chevignon 7874'),'Tarjeta de crédito Chevignon');
assert.equal(obligationLabel('Tarjeta desconocida 123456 Juan Pérez'),'Tarjeta de crédito');
assert.equal(obligationLabel('Pago a Juan Pérez 3001234567'),'Obligación');
for(const digits of ['2699','3261','7874','2973'])assert.ok(!JSON.stringify(context.obligations.map(o=>o.label)).includes(digits));
console.log('OK: etiquetas reconocibles sin números ni nombres personales.');

const withDetails={...original,obligations:[{...original.obligations[0],totalDebt:1000000,interestMV:0,interestEA:null,bank:'Banco privado',bankingUrl:'https://example.com/privado'},{...original.obligations[1],totalDebt:null,interestMV:null,interestEA:null}]};
const detailContext=financialContext(withDetails,'2026-09','2026-09-23');
assert.deepEqual(detailContext.debtCoverage,{recordedDebts:2,knownTotalDebt:1000000,missingTotalDebt:1,missingInterestRate:1});
assert.equal(detailContext.obligations[0].interestMV,0);
assert.ok(!JSON.stringify(detailContext).includes('Banco privado'));assert.ok(!JSON.stringify(detailContext).includes('https://example.com'));
console.log('OK: resumen inicial distingue datos registrados, ceros válidos y campos faltantes.');

// Deletion cannot race an active response and preserves daily attempt counters.
assert.equal(await chats.clearHistory(now().getTime()),false);
assert.ok((await chats.history(input.conversationId,'2026-09',false)).length>0);
const beforeClearing=await ledger.read('2026-09');
assert.equal(await chats.clearHistory(now().getTime()+180000),true);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM coach_turns').get().n,0);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM coach_usage').get().n,30);
assert.equal(await chats.latest('2026-09',false),null);assert.equal(await chats.latest('2026-09',true),null);
assert.equal(await chats.find(first.id),null);
await chats.complete(pending.id,'Late response');assert.equal(await chats.find(pending.id),null);
assert.equal(await chats.reserve({...pending,id:crypto.randomUUID(),conversationId:crypto.randomUUID(),createdAt:now().getTime()+180000},Date.parse('2026-09-23T00:00:00-05:00')),false);
assert.deepEqual(await ledger.read('2026-09'),beforeClearing);
assert.equal(await chats.clearHistory(now().getTime()+180000),true);
const tomorrow=Date.parse('2026-09-24T12:00:00-05:00');
assert.equal(await chats.reserve({...pending,id:crypto.randomUUID(),conversationId:crypto.randomUUID(),createdAt:tomorrow},Date.parse('2026-09-24T00:00:00-05:00')),true);
console.log('OK: limpieza total persistente, protección de consultas activas, cuotas preservadas y contabilidad intacta.');
