// Generate once in the ignored .env.local; never print private keys.
import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
const path=new URL('../.env.local',import.meta.url);
const content=await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
const has=name=>new RegExp(`^${name}=.+$`,'m').test(content);
if(has('WEB_PUSH_PUBLIC_KEY')!==has('WEB_PUSH_PRIVATE_KEY')) throw new Error('Hay una pareja VAPID incompleta. Corrígela antes de generar claves.');
const values={};
if(!has('WEB_PUSH_PUBLIC_KEY')) {const keys=webpush.generateVAPIDKeys();values.WEB_PUSH_PUBLIC_KEY=keys.publicKey;values.WEB_PUSH_PRIVATE_KEY=keys.privateKey;}
if(!has('WEB_PUSH_SUBJECT')) values.WEB_PUSH_SUBJECT='https://smart-balance-ia.vercel.app';
if(!has('CRON_SECRET')) values.CRON_SECRET=randomBytes(32).toString('hex');
if(Object.keys(values).length) await appendFile(path,'\n'+Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
console.log('Configuración Web Push preparada en .env.local. No se mostraron claves.');
