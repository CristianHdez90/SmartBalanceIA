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
const inboxDomain=load('src/domain/notification-inbox.ts',{'./reminders':domain});
const {RemindersRepository}=load('src/infrastructure/reminders.ts',{'../domain/notification-inbox':inboxDomain,'../domain/reminders':domain,'../domain/finance':load('src/domain/finance.ts')});
const {WebPushRepository,dispatchWebPush}=load('src/infrastructure/web-push.ts',{'./notification-inbox':load('src/infrastructure/notification-inbox.ts'),'./reminders':{RemindersRepository},'../domain/reminders':domain,'../domain/web-push':pushDomain});
const before=Date.parse('2026-10-21T07:00:00-05:00'),now=Date.parse('2026-10-21T08:05:00-05:00');
const subscription=id=>({endpoint:`https://fcm.googleapis.com/fcm/send/${id}`,keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}});
async function fixture() {
  const client=createClient({url:':memory:'});
  await client.execute('PRAGMA foreign_keys=ON');
  await client.execute('CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT)');
  await client.execute("INSERT INTO users VALUES('alice','active'),('bob','active')");
  await client.execute('CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER)');
  await client.execute({sql:"INSERT INTO sessions VALUES('a','alice',?),('b','bob',?)",args:[now+86400000,now+86400000]});
  await client.execute('CREATE TABLE obligations(id TEXT,user_id TEXT,month TEXT,due_date TEXT,due_day INTEGER,amount INTEGER,name TEXT DEFAULT \'Obligación\',note TEXT DEFAULT \'\')');
  await client.execute('CREATE TABLE movements(user_id TEXT,obligation_id TEXT,kind TEXT,amount INTEGER)');
  await client.execute('CREATE TABLE obligation_carries(user_id TEXT,source_id TEXT,target_id TEXT,amount INTEGER)');
  for(const file of ['0014_device_reminders.sql','0015_web_push.sql','0016_auxiliary_interval.sql','0017_notification_inbox.sql','0018_supermarket_details.sql','0019_notification_repeat.sql']) {
    const sql=readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8');
    await client.batch(sql.split(/-->\s*statement-breakpoint/).filter(s=>s.trim()),'write');
  }
  const db={prepare(sql,args=[]) {return {bind(...args){return db.prepare(sql,args);},async all(){const r=await client.execute({sql,args});return {results:r.rows.map(r=>({...r})),meta:{changes:r.rowsAffected}};},async first(){return (await this.all()).results[0]??null;},async run(){return this.all();},toQuery(){return{sql,args};}};},async batch(statements){return client.batch(statements.map(s=>s.toQuery()),'write');}};
  const alice=new WebPushRepository(db,'alice','a'),bob=new WebPushRepository(db,'bob','b');
  await alice.subscribe(subscription('alice'));await bob.subscribe(subscription('bob'));
  await db.prepare('UPDATE web_push_subscriptions SET created_at=?').bind(before).run();
  await client.execute("INSERT INTO obligations(id,user_id,month,due_date,due_day,amount) VALUES('debt','alice','2026-10','2026-10-21',NULL,100000)");
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
test('enabling after the scheduled time catches up today only once',async()=>{
  const f=await fixture();try {
    await f.db.prepare('UPDATE web_push_subscriptions SET created_at=?').bind(now).run();
    assert.equal((await dispatchWebPush(f.db,now,async()=>{})).sent,1);
    assert.equal((await dispatchWebPush(f.db,now+60000,async()=>assert.fail('duplicate'))).sent,0);
  }finally{f.client.close();}
});
test('auxiliary interval persists per account, gates repeated checks, and leaves Vercel independent',async()=>{
  const f=await fixture();try {
    const r=new RemindersRepository(f.db,'alice');
    await r.execute({action:'settings',settings:{...domain.defaultReminderSettings,auxiliaryMinutes:120}});
    assert.equal((await r.read(now)).settings.auxiliaryMinutes,120);
    assert.equal((await new RemindersRepository(f.db,'bob').read(now)).settings.auxiliaryMinutes,30);
    let attempts=0;const fail=async()=>{attempts++;throw {statusCode:503};};
    await dispatchWebPush(f.db,now,fail,'github');
    await dispatchWebPush(f.db,now+30*60000,fail,'github');
    assert.equal(attempts,1);
    await dispatchWebPush(f.db,now+120*60000,fail,'github');
    assert.equal(attempts,2);
    await r.execute({action:'settings',settings:{...domain.defaultReminderSettings,auxiliaryMinutes:0}});
    await dispatchWebPush(f.db,now+240*60000,fail,'github');
    assert.equal(attempts,2);
    const delivered=[];
    await dispatchWebPush(f.db,now+240*60000,async row=>delivered.push(row.id),'vercel');
    assert.equal(delivered.length,1);
  }finally{f.client.close();}
});
test('shorter intervals take effect without another workflow edit; unsupported intervals are rejected',async()=>{
  assert.equal(domain.reminderSettings.safeParse({...domain.defaultReminderSettings,auxiliaryMinutes:17}).success,false);
  const f=await fixture();try {
    const r=new RemindersRepository(f.db,'alice');
    await r.execute({action:'settings',settings:{...domain.defaultReminderSettings,auxiliaryMinutes:360}});
    await dispatchWebPush(f.db,now,async()=>{throw {statusCode:503};},'github');
    await r.execute({action:'settings',settings:{...domain.defaultReminderSettings,auxiliaryMinutes:30}});
    const result=await dispatchWebPush(f.db,now+30*60000,async()=>{},'github');
    assert.equal(result.sent,1);
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
test('local checks only send to the authenticated account and selected browser',async()=>{
  const f=await fixture();try {
    const sent=[];const send=async row=>sent.push(row.endpoint);
    await dispatchWebPush(f.db,now,send,'vercel',{userId:'bob',endpoint:subscription('alice').endpoint});
    assert.equal(sent.length,0);
    await dispatchWebPush(f.db,now,send,'vercel',{userId:'alice',endpoint:subscription('alice').endpoint});
    assert.deepEqual(sent,[subscription('alice').endpoint]);
  }finally{f.client.close();}
});
test('local test endpoint is disabled in production and on external hosts',async()=>{
  const original=process.env.NODE_ENV;
  const handler=load('app/api/web-push/local-check/route.ts',{
    '@/src/infrastructure/database':{database:()=>assert.fail('must not access database')},
    '@/src/infrastructure/d1-auth':{},
    '@/src/infrastructure/request-origin':{},
    '@/src/domain/web-push':pushDomain,
    '@/src/infrastructure/web-push':{},
  });
  try {
    process.env.NODE_ENV='production';
    assert.equal((await handler.POST(new Request('http://localhost/api/web-push/local-check',{method:'POST'}))).status,404);
    process.env.NODE_ENV='development';
    assert.equal((await handler.POST(new Request('https://balance.test/api/web-push/local-check',{method:'POST'}))).status,404);
  }finally{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
});
test('local endpoint accepts all four test intervals, rate-limits calls and forwards account scope',async()=>{
  const original=process.env.NODE_ENV,originalNow=Date.now;let clock=now,user='alice';const calls=[];
  class AuthError extends Error {}
  const handler=load('app/api/web-push/local-check/route.ts',{
    '@/src/infrastructure/database':{database:()=>({})},
    '@/src/infrastructure/d1-auth':{AuthError,D1AuthRepository:class{async requireUser(){return {id:user};}}},
    '@/src/infrastructure/request-origin':{isAllowedOrigin:()=>true},
    '@/src/domain/web-push':pushDomain,
    '@/src/infrastructure/web-push':{pushConfiguration:()=>true,dispatchWebPush:async(...args)=>{calls.push(args[4]);return {sent:0,failed:0};}},
  });
  const request=seconds=>new Request('http://127.0.0.1:8787/api/web-push/local-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds,endpoint:subscription('local').endpoint})});
  try {
    process.env.NODE_ENV='development';Date.now=()=>clock;
    for(const seconds of [30,60,600,1200]) {
      user=`user-${seconds}`;
      assert.equal((await handler.POST(request(seconds))).status,200);
      assert.equal((await handler.POST(request(seconds))).status,429);
      clock+=seconds*1000;
      assert.equal((await handler.POST(request(seconds))).status,200);
      assert.deepEqual(calls.at(-1),{userId:user,endpoint:subscription('local').endpoint});
    }
    assert.equal((await handler.POST(request(17))).status,400);
  }finally{Date.now=originalNow;if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
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

test('saved repeating frequency is shared by frontend and GitHub, with atomic deduplication and disable',async()=>{
 const f=await fixture();try{
 const prefs=new RemindersRepository(f.db,'alice');
 await prefs.execute({action:'settings',settings:{...domain.defaultReminderSettings,repeatSeconds:30}});
 let calls=0;const send=async()=>{calls++};
 assert.equal((await dispatchWebPush(f.db,now,send,'frontend',{userId:'alice'})).sent,1);
 assert.equal((await dispatchWebPush(f.db,now+29000,send,'github')).sent,0);
 await Promise.all([dispatchWebPush(f.db,now+30000,send,'github'),dispatchWebPush(f.db,now+30000,send,'frontend',{userId:'alice'})]);
 assert.equal(calls,2);
 await prefs.execute({action:'settings',settings:{...domain.defaultReminderSettings,repeatSeconds:600}});
 assert.equal((await dispatchWebPush(f.db,now+60000,send,'github')).sent,0);
 assert.equal((await dispatchWebPush(f.db,now+630000,send,'github')).sent,1);
 await prefs.execute({action:'settings',settings:{...domain.defaultReminderSettings,repeatSeconds:0}});
 assert.equal((await dispatchWebPush(f.db,now+1300000,send,'vercel')).sent,0);
 await prefs.execute({action:'settings',settings:{...domain.defaultReminderSettings,repeatSeconds:30}});
 await f.client.execute("INSERT INTO movements VALUES('alice','debt','payment',100000)");
 assert.equal((await dispatchWebPush(f.db,now+1400000,send,'github')).sent,0);
 }finally{f.client.close();}
});
