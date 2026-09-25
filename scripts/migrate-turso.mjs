import {createClient} from '@libsql/client';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const url=process.env.TURSO_DATABASE_URL?.trim();
if(!url)throw new Error('Falta TURSO_DATABASE_URL.');
if(url.startsWith('file:'))await mkdir(resolve(root,dirname(url.slice(5))),{recursive:true});
const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
const client=createClient({url,...(authToken?{authToken}:{})});

await client.execute(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY NOT NULL,
  applied_at INTEGER NOT NULL
)`);
const applied=new Set((await client.execute('SELECT name FROM _migrations')).rows.map(row=>String(row.name)));
const files=(await readdir(resolve(root,'drizzle'))).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of files){
 if(applied.has(name))continue;
 const sql=await readFile(resolve(root,'drizzle',name),'utf8');
 const statements=sql.split(/-->\s*statement-breakpoint/g).map(value=>value.trim()).filter(Boolean);
 await client.batch([...statements.map(statement=>({sql:statement})),{sql:'INSERT INTO _migrations (name,applied_at) VALUES (?,?)',args:[name,Date.now()]}],'write');
 console.log(`Aplicada ${name}`);
}
client.close();
console.log('Esquema de Turso actualizado.');
