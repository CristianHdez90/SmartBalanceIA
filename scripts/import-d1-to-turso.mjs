import {createClient} from '@libsql/client';
import {DatabaseSync} from 'node:sqlite';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const url=process.env.TURSO_DATABASE_URL?.trim();
if(!url)throw new Error('Falta TURSO_DATABASE_URL. Ejecuta primero npm run db:migrate.');
const sourceDirectory=resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sourceName=(await readdir(sourceDirectory)).find(name=>name.endsWith('.sqlite'));
if(!sourceName)throw new Error('No se encontró la base D1 local en .wrangler/state.');
const source=new DatabaseSync(resolve(sourceDirectory,sourceName),{readOnly:true});
const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
const target=createClient({url,...(authToken?{authToken}:{})});
const tables=['users','obligations','movements','daily_expenses','coach_turns','coach_usage','promotion_cache','sessions','email_verifications','password_reset_requests','auth_events'];
const existing=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name)));
for(const table of tables){
 if(!existing.has(table))continue;
 const definition=source.prepare(`PRAGMA table_info(${table})`).all();
 const columns=definition.map(row=>String(row.name));
 const primaryKey=definition.filter(row=>Number(row.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(row=>String(row.name));
 if(!primaryKey.length)throw new Error(`La tabla ${table} no tiene clave primaria.`);
 const records=source.prepare(`SELECT * FROM ${table}`).all();
 if(!records.length)continue;
 const placeholders=columns.map(()=>'?').join(',');
 const mutable=columns.filter(column=>!primaryKey.includes(column));
 const sql=`INSERT INTO ${table} (${columns.map(column=>`\`${column}\``).join(',')}) VALUES (${placeholders}) ON CONFLICT (${primaryKey.map(column=>`\`${column}\``).join(',')}) DO UPDATE SET ${mutable.map(column=>`\`${column}\`=excluded.\`${column}\``).join(',')}`;
 for(let index=0;index<records.length;index+=100){
  const chunk=records.slice(index,index+100).map(record=>({sql,args:columns.map(column=>record[column]??null)}));
  await target.batch(chunk,'write');
 }
 console.log(`${table}: ${records.length} registros importados`);
}
source.close();target.close();
console.log('Datos locales transferidos a Turso.');
