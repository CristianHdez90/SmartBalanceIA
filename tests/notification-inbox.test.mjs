import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createClient} from '@libsql/client';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}};new Function('require','module','exports',outputText)(n=>deps[n]??require(n),module,module.exports);return module.exports;
}
const domain=load('src/domain/reminders.ts');
const {todayNotifications}=load('src/domain/notification-inbox.ts',{'./reminders':domain});
const {NotificationInboxRepository}=load('src/infrastructure/notification-inbox.ts');
const now=Date.parse('2026-10-21T18:00:00-05:00');
const promo={id:'one',supermarket:'Supermu',product:'Frutas',weekdays:[0,1,2,3,4,5,6],startDate:'2026-10-01',endDate:'2026-11-01',enabled:true,note:'Sucursal centro',version:1};
async function fixture(){
 const client=createClient({url:':memory:'});await client.execute('CREATE TABLE users(id TEXT PRIMARY KEY)');await client.execute('CREATE TABLE obligations(id TEXT, user_id TEXT, month TEXT)');await client.execute("INSERT INTO users VALUES('alice'),('bob')");
 await client.batch(readFileSync(new URL('../drizzle/0017_notification_inbox.sql',import.meta.url),'utf8').split(/-->\s*statement-breakpoint/),'write');
 const db={prepare(sql,args=[]){return {bind(...args){return db.prepare(sql,args);},toQuery(){return{sql,args};},async all(){const r=await client.execute({sql,args});return{results:r.rows.map(r=>({...r})),meta:{changes:r.rowsAffected}};},async first(){return(await this.all()).results[0]??null;},async run(){return this.all();}};},async batch(statements){return client.batch(statements.map(s=>s.toQuery()),'write');}};
 return{client,alice:new NotificationInboxRepository(db,'alice'),bob:new NotificationInboxRepository(db,'bob')};
}
test('daily promotions appear after notification time, repeat on the next day and respect validity',()=>{
 const settings=domain.defaultReminderSettings;
 const current=todayNotifications(settings,[promo],[],now);
 assert.equal(current.length,1);assert.match(current[0].body,/Frutas.*\n.*Sucursal centro/s);
 assert.notEqual(current[0].id,todayNotifications(settings,[promo],[],now+86400000)[0].id);
 for(const override of [{enabled:false},{weekdays:[0]},{startDate:'2026-10-22'},{endDate:'2026-10-20'}])assert.deepEqual(todayNotifications(settings,[{...promo,...override}],[],now),[]);
 assert.deepEqual(todayNotifications({...settings,promotions:false},[promo],[],now),[]);
 // 02:00 UTC is still the previous calendar day in Colombia.
 assert.equal(todayNotifications(settings,[promo],[],Date.parse('2026-10-22T02:00:00Z'))[0].day,'2026-10-21');
});
test('inbox persists read status, contains details and isolates accounts',async()=>{
 const f=await fixture();try{
  const items=todayNotifications(domain.defaultReminderSettings,[promo],[],now);
  const initial=await f.alice.refresh(items,now);assert.equal(initial.unread,1);
  assert.equal((await f.bob.list()).items.length,0);assert.equal(await f.bob.markRead(items[0].id),false);
  await f.alice.markRead(items[0].id,now+1);
  assert.equal((await f.alice.refresh(items,now+30000)).unread,0);
  const history=await f.alice.refresh([],now+60000);
  assert.equal(history.items.length,1);assert.equal(history.items[0].active,false);assert.equal(history.items[0].readAt,now+1);
  const next=await f.alice.refresh(todayNotifications(domain.defaultReminderSettings,[promo],[],now+86400000),now+86400000);
  assert.equal(next.items.length,2);assert.equal(next.unread,1);
 }finally{f.client.close();}
});
test('paid obligations and paused promotions stop lighting the bell but stay in history',async()=>{
 const f=await fixture();try{
  const pending=[{id:'debt',name:'Pago de prueba',dueDate:'2026-10-21',pending:100}];
  const items=todayNotifications(domain.defaultReminderSettings,[promo],pending,now);
  assert.equal((await f.alice.refresh(items,now)).unread,2);
  const inactive=todayNotifications(domain.defaultReminderSettings,[{...promo,enabled:false}],[{...pending[0],pending:0}],now);
  const data=await f.alice.refresh(inactive,now+1);assert.equal(data.unread,0);assert.equal(data.items.length,2);
 }finally{f.client.close();}
});
test('frontend intervals are stored separately per account, including 30 seconds and 1/10/20 minutes',()=>{
 const storage=new Map();const original=globalThis.localStorage;
 globalThis.localStorage={getItem:key=>storage.get(key)??null};
 try{
  const {readNotificationInterval,notificationIntervalKey}=load('src/presentation/notification-refresh.ts');
  assert.equal(readNotificationInterval('alice'),60);
  for(const seconds of [0,30,60,600,1200]){storage.set(notificationIntervalKey('alice'),String(seconds));assert.equal(readNotificationInterval('alice'),seconds);}
  assert.equal(readNotificationInterval('bob'),60);
  storage.set(notificationIntervalKey('alice'),'garbage');assert.equal(readNotificationInterval('alice'),60);
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('payment reminders repeat daily through partial payments and stop at zero',()=>{
 const settings=domain.defaultReminderSettings;
 const debt={id:'debt',dueDate:'2026-10-24',pending:100};
 for(let offset=0;offset<7;offset++){
  const notices=todayNotifications(settings,[],[{...debt,pending:offset>2?20:100}],now+offset*86400000);
  assert.equal(notices.length,1);
  assert.equal(notices[0].day,domain.addDays('2026-10-21',offset));
 }
 assert.deepEqual(todayNotifications(settings,[],[{...debt,pending:0}],now+7*86400000),[]);
});

test('payment destination identifies its exact month and cannot target another account',async()=>{
 const f=await fixture();try{
  await f.client.execute("INSERT INTO obligations VALUES ('debt','alice','2026-09')");
  const notices=todayNotifications(domain.defaultReminderSettings,[],[{id:'debt',dueDate:'2026-09-24',pending:10}],now);
  const result=await f.alice.refresh(notices,now);
  assert.equal(result.items[0].targetId,'debt');assert.equal(result.items[0].targetMonth,'2026-09');
  const other=await f.bob.refresh(notices,now);
  assert.equal(other.items[0].targetId,null);
 }finally{f.client.close();}
});

test('deleting selected notifications is scoped and does not recreate them on refresh',async()=>{
 const f=await fixture();try{
 const notices=todayNotifications(domain.defaultReminderSettings,[promo],[],now);
 await f.alice.refresh(notices,now);await f.bob.refresh(notices,now);
 await f.alice.remove([notices[0].id]);
 assert.equal((await f.alice.refresh(notices,now+1000)).items.length,0);
 assert.equal((await f.bob.list()).items.length,1);
 assert.equal(await f.alice.markRead(notices[0].id),false);
 assert.equal((await f.alice.refresh(todayNotifications(domain.defaultReminderSettings,[promo],[],now+86400000),now+86400000)).items.length,1);
 }finally{f.client.close();}
});
