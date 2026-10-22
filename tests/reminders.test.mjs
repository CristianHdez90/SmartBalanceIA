import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require','module','exports', outputText)(name => deps[name] ?? require(name), module, module.exports);
  return module.exports;
}
const domain = load('src/domain/reminders.ts'), finance = load('src/domain/finance.ts');
const inboxDomain=load('src/domain/notification-inbox.ts',{'./reminders':domain});
const { RemindersRepository } = load('src/infrastructure/reminders.ts', { '../domain/notification-inbox':inboxDomain, '../domain/reminders': domain, '../domain/finance': finance });
const now = Date.parse('2026-10-21T07:00:00-05:00');
const promotion = () => ({ id: crypto.randomUUID(), supermarket: 'Supermu', product: 'Frutas', weekdays: [3], startDate: '2026-10-21', endDate: '2026-10-28', note: 'Sucursal local', enabled: true, version: 0 });
test('validates dates, weekdays, time, ownership and end of validity', () => {
  const p = { action: 'save', ...promotion() };
  assert.equal(domain.reminderCommand.safeParse(p).success, true);
  for (const bad of [{ weekdays: [] }, { weekdays: [7] }, { weekdays: [3,3] }, { startDate: '2026-02-30' }, { endDate: '2026-10-20' }, { userId: 'other' }]) assert.equal(domain.reminderCommand.safeParse({ ...p, ...bad }).success, false);
  assert.equal(domain.reminderSettings.safeParse({ ...domain.defaultReminderSettings, time: '24:00' }).success, false);
});
test('Bogota time, advance notice, due day, overdue and paid exclusions', () => {
  const s = domain.defaultReminderSettings;
  const pending = [{ id: 'one', dueDate: '2026-10-24', pending: 100 }];
  const plan = domain.buildReminderPlan(s, [], pending, now);
  assert.equal(plan[0].at, Date.parse('2026-10-21T13:00:00Z'));
  assert.equal(plan.some(p => p.id === 'balance-2026-10-22'), true);
  assert.equal(plan.some(p => p.id === 'balance-2026-10-24'), true);
  assert.equal(plan.some(p => p.id === 'balance-2026-10-25'), true);
  assert.deepEqual(domain.buildReminderPlan(s, [], [{ ...pending[0], pending: 0 }], now), []);
  assert.deepEqual(domain.buildReminderPlan(s, [], [{ ...pending[0], pending: null }], now), []);
  assert.deepEqual(domain.buildReminderPlan(s, [], [{ ...pending[0], dueDate: null }], now), []);
  assert.equal(domain.buildReminderPlan(s, [], pending, Date.parse('2026-10-21T08:01:00-05:00'))[0].id, 'balance-2026-10-22');
  assert.equal(domain.bogotaDay(Date.parse('2026-10-22T02:00:00Z')), '2026-10-21');
});
test('weekly promotions respect expiry, pauses and consolidate private daily summaries', () => {
  const p = promotion(), s = domain.defaultReminderSettings;
  const plan = domain.buildReminderPlan(s, [p], [], now);
  assert.deepEqual(plan.map(v => v.id), ['balance-2026-10-21','balance-2026-10-28']);
  assert.deepEqual(domain.buildReminderPlan(s, [{ ...p, enabled: false }], [], now), []);
  assert.deepEqual(domain.buildReminderPlan({ ...s, promotions: false }, [p], [], now), []);
  const combined = domain.buildReminderPlan(s, [p,p], [{ id:'debt', dueDate:'2026-10-21', pending:400000 }], now);
  assert.equal(combined.length, 30);
  assert.equal(new Set(combined.map(p => p.id)).size, 30);
  assert.match(combined[0].body, /pagos.*promociones/);
  assert.equal(combined.some(p => p.body.includes('400000')), false);
  assert.equal(JSON.stringify(combined).includes('Supermu'), false);
});
async function fixture() {
  const client = createClient({ url: ':memory:' });
  await client.execute('CREATE TABLE users(id TEXT PRIMARY KEY)');
  await client.execute("INSERT INTO users VALUES('alice'),('bob')");
  await client.execute('CREATE TABLE obligations(id TEXT,user_id TEXT,month TEXT,due_date TEXT,due_day INTEGER,amount INTEGER,name TEXT DEFAULT \'Obligación\',note TEXT DEFAULT \'\')');
  await client.execute('CREATE TABLE movements(user_id TEXT,obligation_id TEXT,kind TEXT,amount INTEGER)');
  await client.execute('CREATE TABLE obligation_carries(user_id TEXT,source_id TEXT,target_id TEXT,amount INTEGER)');
  const sql = readFileSync(new URL('../drizzle/0014_device_reminders.sql', import.meta.url),'utf8');
  await client.batch(sql.split(/-->\s*statement-breakpoint/).filter(s => s.trim()),'write');
  const auxiliarySql=readFileSync(new URL('../drizzle/0016_auxiliary_interval.sql',import.meta.url),'utf8');
  await client.batch(auxiliarySql.split(/-->\s*statement-breakpoint/).filter(s=>s.trim()),'write');
  const db = { prepare(sql, args = []) { return { bind(...args) { return db.prepare(sql,args); }, async all() { const r = await client.execute({sql,args}); return {results:r.rows.map(r=>({...r})),meta:{changes:r.rowsAffected}}; }, async first() { return (await this.all()).results[0]??null; }, async run() { return this.all(); } }; } };
  return { client, alice: new RemindersRepository(db,'alice'), bob: new RemindersRepository(db,'bob') };
}
test('repository isolates settings, promotions, deletes and payments per account', async () => {
  const { client,alice,bob } = await fixture();
  try {
    const p = promotion();
    await alice.execute({action:'save',...p});
    assert.equal((await alice.read(now)).promotions.length,1);
    assert.equal((await bob.read(now)).promotions.length,0);
    await assert.rejects(bob.execute({action:'delete',id:p.id,version:1}),domain.ReminderConflict);
    await alice.execute({action:'save',...p,version:1,enabled:false});
    await assert.rejects(alice.execute({action:'save',...p,version:1}),domain.ReminderConflict);
    await client.execute("INSERT INTO obligations(id,user_id,month,due_date,due_day,amount) VALUES('o','alice','2026-10',NULL,24,100)");
    await client.execute("INSERT INTO movements VALUES('bob','o','payment',100)");
    assert.equal((await alice.read(now)).plan[0].id,'balance-2026-10-21');
    await client.execute("INSERT INTO obligation_carries VALUES('alice','o','next',40)");
    await client.execute("INSERT INTO movements VALUES('alice','o','payment',60)");
    assert.deepEqual((await alice.read(now)).plan,[]);
    await alice.execute({action:'settings',settings:{...domain.defaultReminderSettings,time:'09:30',payments:false}});
    assert.equal((await alice.read(now)).settings.time,'09:30');
    assert.equal((await bob.read(now)).settings.time,'08:00');
    await alice.execute({action:'delete',id:p.id,version:2});
    assert.deepEqual((await alice.read(now)).promotions,[]);
  } finally { client.close(); }
});

test('native scheduler replaces duplicates, refuses permission denial and clears on logout or account switch', async () => {
  const stored = new Map(), scheduled = new Map(); let permission = true;
  const notifications = {
    setNotificationHandler() {},
    AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    async getAllScheduledNotificationsAsync() { return [...scheduled.keys()].map(identifier => ({identifier})); },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async dismissAllNotificationsAsync() {}, clearLastNotificationResponse() {}, async setNotificationChannelAsync() {},
    async getPermissionsAsync() { return {granted:permission}; }, async requestPermissionsAsync() { return {granted:permission}; },
    async scheduleNotificationAsync(input) { scheduled.set(input.identifier,input); },
  };
  const secure = { async getItemAsync(key) { return stored.get(key)??null; }, async setItemAsync(key,value) { stored.set(key,value); }, async deleteItemAsync(key) { stored.delete(key); } };
  const policy=load('mobile/src/reminder-policy.ts');
  const native=load('mobile/src/notifications.ts', {'react-native':{Platform:{OS:'android'}},'expo-notifications':notifications,'expo-secure-store':secure,'./reminder-policy':policy});
  const plan=[{id:'balance-2026-10-21',at:Date.now()+3600000,title:'Mi Balance IA',body:'Tienes pagos por revisar. Consulta tus obligaciones.',section:'reminders'}];
  const call=(action,userId='alice',items=plan)=>native.handleReminderMessage(JSON.stringify({type:'mi-balance-reminders',action,id:crypto.randomUUID(),userId,plan:items}));
  assert.equal((await call('sync')).enabled,false);
  assert.equal((await call('enable')).count,1);
  await call('sync'); assert.equal(scheduled.size,1);
  await call('sync','alice',[]); assert.equal(scheduled.size,0);
  await call('sync'); assert.equal(scheduled.size,1);
  await call('clear'); assert.equal(scheduled.size,0);
  assert.equal((await call('sync')).enabled,false);
  await call('enable'); await call('sync','bob'); assert.equal(scheduled.size,0);
  permission=false; assert.match((await call('enable')).error,/Permite las notificaciones/);
  assert.equal(scheduled.size,0);
});
