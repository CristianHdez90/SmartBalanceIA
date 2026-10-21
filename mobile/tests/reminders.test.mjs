import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReminderMessage } from '../src/reminder-policy.ts';
const now=Date.parse('2026-10-21T12:00:00Z');
const message=()=>({type:'mi-balance-reminders',action:'enable',id:'request-1',userId:'alice',plan:[{id:'balance-2026-10-21',at:now+3600000,title:'Mi Balance IA',body:'Tienes pagos por revisar. Consulta tus obligaciones.',section:'reminders'}]});
test('bridge accepts bounded private schedules and clear on logout',()=>{
 assert.equal(parseReminderMessage(JSON.stringify(message()),now).plan.length,1);
 assert.equal(parseReminderMessage(JSON.stringify({type:'mi-balance-reminders',action:'clear',id:'request-2'}),now).action,'clear');
});
test('bridge rejects oversized, arbitrary, duplicate and expired notifications',()=>{
 const good=message();
 for(const patch of [{plan:Array(31).fill(good.plan[0])},{plan:[good.plan[0],good.plan[0]]},{action:'open-url'},{userId:'../owner'},{plan:[{...good.plan[0],body:'Private account data'}]},{plan:[{...good.plan[0],at:now-120000}]},{plan:[{...good.plan[0],at:now+32*86400000}]}])assert.throws(()=>parseReminderMessage(JSON.stringify({...good,...patch}),now));
 assert.throws(()=>parseReminderMessage('a'.repeat(64001),now));
});
