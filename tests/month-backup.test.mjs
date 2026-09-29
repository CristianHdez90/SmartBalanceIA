import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,dependencies={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 const module={exports:{}};new Function('require','module','exports',outputText)(name=>dependencies[name]??require(name),module,module.exports);return module.exports;
}
const finance=load('src/domain/finance.ts');
const domain=load('src/domain/month-backup.ts',{'./finance':finance});
const database=load('src/infrastructure/database.ts');
const {MonthBackups}=load('src/infrastructure/month-backups.ts',{'../domain/month-backup':domain,'../domain/finance':finance});
const report=load('src/domain/payment-report.ts',{'./finance':finance});
const exports=load('src/infrastructure/month-export.ts',{'../domain/month-backup':domain,'../domain/finance':finance,'../domain/payment-report':report});
const sample=()=>domain.validateBackup({version:1,month:'2026-12',userId:'alice',exportedAt:'2026-12-20T12:00:00.000Z',
 obligations:[{id:'bill',user_id:'alice',month:'2026-12',name:"Cuota d'Ávila; prueba",category:'Créditos',amount:800,note:'Primera línea\nSegunda, con "comillas"',cutoff_date:null,due_date:'2026-12-15',series_id:'serie',cutoff_day:30,due_day:15,total_debt:10000,bank:'Banco',banking_url:'https://example.com/',interest_mv:1.5,interest_ea:null,recurring_amount:850}],
 movements:[{id:'income',user_id:'alice',month:'2026-12',kind:'income',obligation_id:null,amount:2000,date:'2026-12-01',description:'=SUM(1,1)'},{id:'payment',user_id:'alice',month:'2026-12',kind:'payment',obligation_id:'bill',amount:500,date:'2026-11-30',description:'Anticipado'}],
 daily_expenses:[{id:'expense',user_id:'alice',month:'2026-12',category:'Otros',amount:100,date:'2026-12-02',description:'Gasto'}],
 balance_transfers:[{id:'transfer',user_id:'alice',from_month:'2026-12',to_month:'2027-01',amount:700,created_at:1797768000000}],
});
async function fixture(){
 const client=createClient({url:':memory:'});
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())await client.batch(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split(/-->\s*statement-breakpoint/).filter(s=>s.trim()),'write');
 await client.execute("INSERT INTO users(id,email,display_name,password_hash,password_salt,created_at) VALUES('alice','a@test.invalid','Alice','x','x',0),('bob','b@test.invalid','Bob','x','x',0)");
 const db=new database.TursoDatabase(client);const alice=new MonthBackups(db,'alice'),bob=new MonthBackups(db,'bob');
 return {client,db,alice,bob};
}
test('SQL round trip preserves complete fields and rejects corruption, arbitrary SQL, bad relations and oversized input',()=>{
 const b=sample(),sql=domain.encodeBackup(b);
 assert.deepEqual(domain.decodeBackup(sql),b);
 assert.match(sql,/INSERT OR IGNORE INTO obligations/);assert.match(sql,/d''Ávila/);
 for(const invalid of [sql+'DROP TABLE users;',sql.slice(0,-15),sql.replace('INSERT OR IGNORE','DELETE'), 'SELECT 1;', 'x'.repeat(domain.MAX_BACKUP_BYTES+1)])assert.throws(()=>domain.decodeBackup(invalid),domain.BackupError);
 assert.throws(()=>domain.validateBackup({...b,obligations:[{...b.obligations[0],month:'2027-01'}]}),domain.BackupError);
 assert.throws(()=>domain.validateBackup({...b,movements:[{...b.movements[1],obligation_id:'missing'}]}),domain.BackupError);
 assert.throws(()=>domain.validateBackup({...b,balance_transfers:[{...b.balance_transfers[0],to_month:'2027-02'}]}),domain.BackupError);
});
test('restores complete month, recovers data loss, preserves other months/accounts and is idempotent',async()=>{
 const {client,alice,bob}=await fixture();try{
  // The exported file is also valid SQLite INSERT SQL, without executing it in the upload endpoint.
  await client.executeMultiple(domain.encodeBackup(sample()));
  await client.execute("INSERT INTO movements(id,user_id,month,kind,amount,description) VALUES('other','alice','2027-02','income',300,'Otro mes'),('bob-income','bob','2026-12','income',600,'Otra cuenta')");
  const backup=await alice.read('2026-12'),encoded=domain.encodeBackup(backup);
  await client.executeMultiple("DELETE FROM movements WHERE user_id='alice' AND month='2026-12'; DELETE FROM obligations WHERE id='bill'; DELETE FROM daily_expenses WHERE id='expense'; DELETE FROM balance_transfers WHERE id='transfer';");
  const b=domain.decodeBackup(encoded),preview=await alice.preview(b);
  assert.equal(preview.currentRecords.obligations,0);assert.deepEqual(preview.adjacentMonths,['2027-01']);
  await alice.restore(b,preview.revision);
  assert.equal(domain.fingerprint(await alice.read(b.month)),domain.fingerprint(backup));
  assert.equal((await alice.read('2027-02')).movements[0].amount,300);assert.equal((await bob.read('2026-12')).movements[0].amount,600);
  assert.equal(finance.totals(domain.toLedger(await alice.read('2027-01'))).available,700);
  assert.equal((await alice.restore(b,preview.revision)).unchanged,true);
  await assert.rejects(bob.preview(b),domain.BackupError);await assert.rejects(bob.restore(b,preview.revision),domain.BackupError);
 }finally{client.close();}
});
test('rejects stale previews and foreign IDs; rolls back all deletions on insert failure',async()=>{
 const {client,alice}=await fixture();try{
  const backup=sample();let preview=await alice.preview(backup);
  await client.execute("INSERT INTO movements(id,user_id,month,kind,amount,description) VALUES('new','alice','2026-12','income',200,'Cambio concurrente')");
  await assert.rejects(alice.restore(backup,preview.revision),/cambiaron/);
  preview=await alice.preview(backup);
  await client.execute("INSERT INTO obligations(id,user_id,month,name,category,amount,note) VALUES('bill','bob','2026-12','Ajena','Otros',1,'')");
  await assert.rejects(alice.restore(backup,preview.revision),/otro mes o cuenta/);
  assert.equal((await alice.read('2026-12')).movements.length,1);
  await client.execute("DELETE FROM obligations WHERE id='bill'");
  await client.execute("CREATE TRIGGER fail_restore BEFORE INSERT ON daily_expenses BEGIN SELECT RAISE(ABORT,'Simulated failure'); END");
  await assert.rejects(alice.restore(backup,preview.revision));
  assert.equal((await alice.read('2026-12')).movements[0].id,'new');assert.equal((await alice.read('2026-12')).obligations.length,0);
 }finally{client.close();}
});
test('Excel exports typed values, dates, pending balance, filters and all sheets; CSV quotes multiline data and neutralizes formulas',async()=>{
 const b=sample();const csv=exports.exportCsv(b);
 assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=SUM/);assert.match(csv,/Primera línea\nSegunda, con ""comillas""/);
 const bytes=await exports.exportExcel(b),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.deepEqual(book.worksheets.map(s=>s.name),['Resumen','Obligaciones','Movimientos','Gastos diarios','Traslados']);
 const cell=(sheet,label)=>{const row=book.getWorksheet(sheet).getRow(1);let column;row.eachCell((c,n)=>{if(c.value===label)column=n;});return book.getWorksheet(sheet).getRow(2).getCell(column);};
 assert.equal(cell('Obligaciones','Saldo pendiente (COP)').value,300);assert.equal(cell('Obligaciones','Cuota recurrente (COP)').value,850);assert.equal(cell('Obligaciones','Interés M.V.').value,0.015);
 assert.equal(cell('Movimientos','Descripción').value,'=SUM(1,1)');assert.equal(cell('Movimientos','Descripción').type,ExcelJS.ValueType.String);
 assert.ok(cell('Movimientos','Fecha real').value instanceof Date);assert.ok(book.getWorksheet('Obligaciones').autoFilter);assert.equal(book.getWorksheet('Obligaciones').views[0].state,'frozen');
});
test('API enforces session, origin, original owner/month and reviewed restoration; download headers are private',async()=>{
 const {client,db}=await fixture();try{
  class AuthError extends Error{constructor(){super('Sesión requerida');this.status=401;}}
  class D1AuthRepository{async requireUser(req){const id=req.headers.get('x-test-user');if(!['alice','bob'].includes(id))throw new AuthError();return {id};}}
  const route=load('app/api/ledger/backup/route.ts',{'@/src/application/ledger-service':{monthSchema:require('zod').z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)},'@/src/domain/month-backup':domain,'@/src/infrastructure/month-backups':{MonthBackups},'@/src/infrastructure/month-export':exports,'@/src/infrastructure/d1-auth':{AuthError,D1AuthRepository},'@/src/infrastructure/database':{...database,database:()=>db},'@/src/infrastructure/request-origin':load('src/infrastructure/request-origin.ts')});
  const req=(user,body,origin='http://localhost:8787')=>new Request('http://localhost:8787/api/ledger/backup?month=2026-12&format=sql',{method:body?'POST':'GET',headers:{...(user?{'x-test-user':user}:{}),origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await route.GET(req())).status,401);assert.equal((await route.POST(req(null,{action:'preview',sql:domain.encodeBackup(sample())}))).status,401);
  assert.equal((await route.POST(req('alice',{action:'preview',sql:''},'https://untrusted.example'))).status,403);
  const sql=domain.encodeBackup(sample());assert.equal((await route.POST(req('bob',{action:'preview',sql}))).status,403);
  assert.equal((await route.POST(req('alice',{action:'restore',sql}))).status,400);
  const preview=await (await route.POST(req('alice',{action:'preview',sql}))).json();
  const restored=await route.POST(req('alice',{action:'restore',sql,revision:preview.revision}));assert.equal(restored.status,200);assert.equal((await restored.json()).month,'2026-12');
  const download=await route.GET(req('alice'));assert.equal(download.status,200);assert.match(download.headers.get('Cache-Control'),/no-store/);assert.match(download.headers.get('Content-Disposition'),/2026-12.sql/);assert.equal(domain.decodeBackup(await download.text()).movements.length,2);
 }finally{client.close();}
});
