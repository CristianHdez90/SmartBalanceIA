import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ts from 'typescript';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
function load(path,deps={}) {
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  const module={exports:{}};
  new Function('require','module','exports',outputText)(name=>deps[name]??require(name),module,module.exports);
  return module.exports;
}
const domain=load('src/domain/reminders.ts'),pushDomain=load('src/domain/web-push.ts');
const {RemindersRepository}=load('src/infrastructure/reminders.ts',{'../domain/reminders':domain,'../domain/finance':load('src/domain/finance.ts')});
const {WebPushRepository,dispatchWebPush}=load('src/infrastructure/web-push.ts',{'./reminders':{RemindersRepository},'../domain/reminders':domain,'../domain/web-push':pushDomain});
const before=Date.parse('2026-10-21T07:00:00-05:00'),now=Date.parse('2026-10-21T08:05:00-05:00');
const subscription=id=>({endpoint:`https://fcm.googleapis.com/fcm/send/${id}`,keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}});
async function fixture() {
  const client=createClient({url:':memory:'});
  await client.execute('PRAGMA foreign_keys=ON');
  await client.execute('CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT)');
  await client.execute("INSERT INTO users VALUES('alice','active'),('bob','active')");
  await client.execute('CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER)');
  await client.execute({sql:"INSERT INTO sessions VALUES('a','alice',?),('b','bob',?)",args:[now+86400000,now+86400000]});
  await client.execute('CREATE TABLE obligations(id TEXT,user_id TEXT,month TEXT,due_date TEXT,due_day INTEGER,amount INTEGER)');
  await client.execute('CREATE TABLE movements(user_id TEXT,obligation_id TEXT,kind TEXT,amount INTEGER)');
  await client.execute('CREATE TABLE obligation_carries(user_id TEXT,source_id TEXT,target_id TEXT,amount INTEGER)');
  for(const file of ['0014_device_reminders.sql','0015_web_push.sql']) {
    const sql=readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8');
    await client.batch(sql.split(/-->\s*statement-breakpoint/).filter(s=>s.trim()),'write');
  }
  const db={prepare(sql,args=[]) {return {bind(...args){return db.prepare(sql,args);},async all(){const r=await client.execute({sql,args});return {results:r.rows.map(r=>({...r})),meta:{changes:r.rowsAffected}};},async first(){return (await this.all()).results[0]??null;},async run(){return this.all();}};}};
  const alice=new WebPushRepository(db,'alice','a'),bob=new WebPushRepository(db,'bob','b');
  await alice.subscribe(subscription('alice'));await bob.subscribe(subscription('bob'));
  await db.prepare('UPDATE web_push_subscriptions SET created_at=?').bind(before).run();
  await client.execute("INSERT INTO obligations VALUES('debt','alice','2026-10','2026-10-21',NULL,100000)");
  return {client,db,alice,bob};
}
test('rejects arbitrary URLs, local hosts, credentials and malformed subscription keys',()=>{
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://evil.test/a','https://a@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a']) assert.equal(pushDomain.isPushEndpoint(endpoint),false,endpoint);
  assert.equal(pushDomain.isPushEndpoint('https://web.push.apple.com/a'),true);
  assert.equal(pushDomain.webPushCommand.safeParse({action:'subscribe',subscription:subscription('ok')}).success,true);
  assert.equal(pushDomain.webPushCommand.safeParse({action:'subscribe',subscription:{...subscription('ok'),keys:{p256dh:'invalid',auth:'invalid'}}}).success,false);
});
test('subscriptions are scoped to the authenticated account and session',async()=>{
  const f=await fixture();try {
    assert.equal(await f.alice.status(subscription('alice').endpoint),true);
    assert.equal(await f.bob.status(subscription('alice').endpoint),false);
    await f.bob.remove(subscription('alice').endpoint);
    assert.equal(await f.alice.status(subscription('alice').endpoint),true);
    await assert.rejects(()=>f.bob.subscribe(subscription('alice')));
    assert.equal(await new WebPushRepository(f.db,'alice','different').status(subscription('alice').endpoint),false);
  }finally{f.client.close();}
});
test('Vercel and auxiliary calls deliver one private daily summary, never twice',async()=>{
  const f=await fixture();try {
    const delivered=[];
    const send=async(row,body,tag)=>delivered.push({user:row.userId,body,tag});
    assert.equal((await dispatchWebPush(f.db,before,send)).sent,0);
    await Promise.all([dispatchWebPush(f.db,now,send),dispatchWebPush(f.db,now,send)]);
    await dispatchWebPush(f.db,now+1800000,send);
    assert.equal(delivered.length,1);
    assert.equal(delivered[0].user,'alice');
    assert.equal(delivered[0].tag,'balance-2026-10-21');
    assert.equal(delivered[0].body.includes('100000'),false);
  }finally{f.client.close();}
});
test('saved times are respected and payments made on the web cancel pending reminders',async()=>{
  const f=await fixture();try {
    await new RemindersRepository(f.db,'alice').execute({action:'settings',settings:{...domain.defaultReminderSettings,time:'14:15'}});
    const calls=[];const send=async row=>calls.push(row.id);
    assert.equal((await dispatchWebPush(f.db,now,send)).sent,0);
    await f.client.execute("INSERT INTO movements VALUES('alice','debt','payment',100000)");
    assert.equal((await dispatchWebPush(f.db,Date.parse('2026-10-21T14:37:00-05:00'),send)).sent,0);
    assert.equal(calls.length,0);
  }finally{f.client.close();}
});
test('promotions follow weekday and custom time even when only auxiliary job runs',async()=>{
  const f=await fixture();try {
    const r=new RemindersRepository(f.db,'bob');
    await r.execute({action:'settings',settings:{...domain.defaultReminderSettings,time:'14:15'}});
    await r.execute({action:'save',id:crypto.randomUUID(),supermarket:'Supermu',product:'Frutas',weekdays:[3],startDate:'2026-10-21',endDate:'2026-10-28',enabled:true,note:'',version:0});
    const calls=[];const send=async(row,body)=>calls.push({user:row.userId,body});
    await dispatchWebPush(f.db,now,send);
    assert.equal(calls.some(c=>c.user==='bob'),false);
    await dispatchWebPush(f.db,Date.parse('2026-10-21T14:37:00-05:00'),send);
    assert.equal(calls.filter(c=>c.user==='bob').length,1);
    assert.equal(calls.some(c=>c.body.includes('Supermu')),false);
  }finally{f.client.close();}
});
test('expired sessions, logout and disabled accounts stop deliveries',async()=>{
  for(const mutation of ["DELETE FROM sessions WHERE id_hash='a'",`UPDATE sessions SET expires_at=${before} WHERE id_hash='a'`,"UPDATE users SET status='disabled' WHERE id='alice'"]) {
    const f=await fixture();try {
      await f.client.execute(mutation);
      assert.equal((await dispatchWebPush(f.db,now,async()=>assert.fail('must not send'))).sent,0);
      assert.equal(await f.alice.status(subscription('alice').endpoint),false);
    }finally{f.client.close();}
  }
});
test('gone endpoints are removed and transient failures retry only after the lease',async()=>{
  const f=await fixture();try {
    let attempts=0;
    const send=async()=>{attempts++;throw {statusCode:503};};
    await dispatchWebPush(f.db,now,send);
    await dispatchWebPush(f.db,now+1000,send);
    assert.equal(attempts,1);
    await dispatchWebPush(f.db,now+600000,async()=>{throw {statusCode:410};});
    assert.equal(await f.alice.status(subscription('alice').endpoint),false);
  }finally{f.client.close();}
});
test('enabling after the scheduled time does not send an old summary',async()=>{
  const f=await fixture();try {
    await f.db.prepare('UPDATE web_push_subscriptions SET created_at=?').bind(now).run();
    assert.equal((await dispatchWebPush(f.db,now,async()=>assert.fail('must not send'))).sent,0);
  }finally{f.client.close();}
});
test('cron refuses missing or invalid credentials before touching the database',async()=>{
  const original=process.env.CRON_SECRET;
  const handler=load('app/api/cron/web-push/route.ts',{
    '@/src/infrastructure/database':{database:()=>assert.fail('must not access database')},
    '@/src/infrastructure/web-push':{pushConfiguration:()=>null},
  });
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await handler.GET(new Request('https://example.test/api/cron/web-push'))).status,401);
    process.env.CRON_SECRET='secret';
    for(const auth of ['', 'Bearer wrong', 'Bearer sécret']) assert.equal((await handler.GET(new Request('https://example.test/api/cron/web-push',{headers:{authorization:auth}}))).status,401);
    assert.equal((await handler.GET(new Request('https://example.test/api/cron/web-push',{headers:{authorization:'Bearer secret'}}))).status,503);
  }finally{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;}
});
test('service worker opens only the app and never caches financial data',async()=>{
  const handlers={},shown=[],opened=[];
  const code=readFileSync(new URL('../public/push-sw.js',import.meta.url),'utf8');
  vm.runInNewContext(code,{URL,self:{addEventListener:(name,fn)=>handlers[name]=fn,location:{origin:'https://balance.test'},registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}});
  assert.equal(handlers.fetch,undefined);
  let promise;
  handlers.push({data:{json:()=>({body:'Tienes pagos por revisar.',url:'https://evil.test'})},waitUntil:p=>promise=p});
  await promise;
  assert.equal(shown[0][1].data.url,'/?section=reminders');
  handlers.notificationclick({notification:{close(){}},waitUntil:p=>promise=p});await promise;
  assert.deepEqual(opened,['https://balance.test/?section=reminders']);
});
