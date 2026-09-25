import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const output=resolve('.test-build-origin');
mkdirSync(output,{recursive:true});
execFileSync('node',['node_modules/typescript/bin/tsc','src/infrastructure/request-origin.ts','--target','ES2022','--module','ES2022','--moduleResolution','Bundler','--outDir',output,'--skipLibCheck'],{stdio:'inherit'});
const {isAllowedOrigin}=await import(pathToFileURL(resolve(output,'request-origin.js')));

assert.equal(isAllowedOrigin(new Request('http://localhost:8787/api/auth',{headers:{origin:'http://127.0.0.1:8787'}})),true);
assert.equal(isAllowedOrigin(new Request('http://localhost:3000/api/auth',{headers:{origin:'https://mi-balance.vercel.app','x-forwarded-host':'mi-balance.vercel.app','x-forwarded-proto':'https'}})),true);
assert.equal(isAllowedOrigin(new Request('https://mi-balance.vercel.app/api/auth',{headers:{origin:'https://sitio-malicioso.example'}})),false);
assert.equal(isAllowedOrigin(new Request('https://mi-balance.vercel.app/api/auth')),false);
console.log('Origin tests passed: loopback aliases, Vercel proxy and external-origin rejection.');
