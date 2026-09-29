import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,dependencies={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}};new Function('require','module','exports',outputText)(name=>dependencies[name]??require(name),module,module.exports);return module.exports;
}
const domain=load('src/domain/finance.ts');
const report=load('src/domain/payment-report.ts',{'./finance':domain});
const {LedgerService,commandSchema}=load('src/application/ledger-service.ts',{'../domain/finance':domain});
const {D1LedgerRepository}=load('src/infrastructure/d1-ledger.ts',{'../domain/finance':domain,'../domain/seed':{reference:[]}});
async function fixture(){
 const client=createClient({url:':memory:'});
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  const sql=readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8');
  await client.batch(sql.split(/-->\s*statement-breakpoint/).filter(s=>s.trim()),'write');
 }
 await client.execute("INSERT INTO users (id,email,display_name,password_hash,password_salt,created_at) VALUES ('alice','a@test.invalid','Alice','x','x',0),('bob','b@test.invalid','Bob','x','x',0)");
 const output=result=>({results:result.rows.map(row=>({...row})),meta:{changes:result.rowsAffected}});
 const db={prepare(sql,args=[]){return {bind(...values){return db.prepare(sql,values);},toQuery(){return {sql,args};},async all(){return output(await client.execute({sql,args}));},async first(){return (await this.all()).results[0]??null;},async run(){return this.all();}};},async batch(statements){return (await client.batch(statements.map(s=>s.toQuery()),'write')).map(output);}};
 const alice=new D1LedgerRepository(db,'alice',false),bob=new D1LedgerRepository(db,'bob',false);
 const service=new LedgerService(alice);
 const income={action:'movement',id:crypto.randomUUID(),month:'2026-12',kind:'income',obligationId:null,amount:1000,date:'2026-12-01',description:'Ingreso prueba'};
 await service.execute(income);
 return {client,alice,bob,service,income};
}
test('transfers exact available across year boundary, preserves total cash, retries once and isolates users',async()=>{
 const {client,alice,bob,service,income}=await fixture();try{
  await service.execute({action:'expense',id:crypto.randomUUID(),month:'2026-12',category:'Otros',amount:100,date:'2026-12-02',description:'Gasto'});
  const input={action:'transferBalance',id:crypto.randomUUID(),month:'2026-12',amount:900};
  await service.execute(input);await service.execute(input);
  const from=await alice.read('2026-12'),to=await alice.read('2027-01');
  assert.equal(domain.totals(from).available,0);assert.equal(domain.totals(to).available,900);
  assert.equal(domain.totals(from).income,income.amount);assert.equal(domain.totals(to).income,0);
  assert.equal(from.transfers.length,1);assert.equal(to.transfers[0].direction,'incoming');
  assert.equal(domain.totals(await bob.read('2027-01')).available,0);
  await assert.rejects(new LedgerService(bob).execute(input),domain.LedgerError);
  await assert.rejects(service.execute({...input,id:crypto.randomUUID(),amount:1}),domain.LedgerError);
  await assert.rejects(service.execute({...input,amount:899}),domain.LedgerError);
  assert.equal((await alice.read('2027-01')).transfers.length,1);
 }finally{client.close();}
});
test('concurrent transfers cannot reuse available money; carried balance can be used in destination',async()=>{
 const {client,alice,service}=await fixture();try{
  const results=await Promise.allSettled([700,700].map(amount=>service.execute({action:'transferBalance',id:crypto.randomUUID(),month:'2026-12',amount})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(domain.totals(await alice.read('2026-12')).available,300);
  const obligation={action:'obligation',id:'bill',month:'2027-01',name:'Cuota',category:'Hogar',amount:500,note:'',dueDate:'2027-01-15'};
  await service.execute(obligation);
  await service.execute({action:'movement',id:crypto.randomUUID(),month:'2027-01',kind:'payment',obligationId:'bill',amount:500,date:'2026-12-28',description:'Pago anticipado'});
  assert.equal(domain.totals(await alice.read('2027-01')).available,200);
  assert.equal(domain.totals(await alice.read('2026-12')).available,300);
 }finally{client.close();}
});
test('payment date edits accept prior months, update reports and preserve amount/month/account ownership',async()=>{
 const {client,alice,bob,service,income}=await fixture();try{
  await service.execute({action:'obligation',id:'bill',month:'2026-12',name:'Cuota',category:'Hogar',amount:500,note:'',dueDate:'2026-12-15'});
  const payment={action:'movement',id:crypto.randomUUID(),month:'2026-12',kind:'payment',obligationId:'bill',amount:500,date:'2026-12-20',description:'Pago'};
  await service.execute(payment);
  let ledger=await alice.read('2026-12');assert.equal(report.paymentReport(ledger.obligations[0],ledger.movements,'2026-12-29').status,'Pagado fuera de plazo');
  const edit={action:'updatePaymentDate',id:payment.id,month:payment.month,date:'2026-11-30'};
  await service.execute(edit);ledger=await alice.read('2026-12');
  assert.equal(report.paymentReport(ledger.obligations[0],ledger.movements,'2026-12-29').status,'Cumplido a tiempo');
  assert.equal(domain.totals(ledger).available,500);assert.equal(ledger.movements.find(m=>m.id===payment.id).month,'2026-12');
  await assert.rejects(new LedgerService(bob).execute(edit),domain.LedgerError);
  await assert.rejects(service.execute({...edit,month:'2026-11'}),domain.LedgerError);
  await assert.rejects(service.execute({...edit,id:income.id}),domain.LedgerError);
  await assert.rejects(service.execute({...income,id:crypto.randomUUID(),date:'2026-11-30'}));
  for(const date of ['2026-02-30','1999-12-31','2026-13-01'])assert.equal(commandSchema.safeParse({...edit,date}).success,false);
  for(const amount of [0,-1,1.5,1e15])assert.equal(commandSchema.safeParse({action:'transferBalance',id:crypto.randomUUID(),month:'2026-12',amount}).success,false);
 }finally{client.close();}
});
