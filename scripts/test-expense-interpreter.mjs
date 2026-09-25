import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const output=resolve('.sites-runtime/expense-interpreter-tests');mkdirSync(output,{recursive:true});
execFileSync('node',['node_modules/typescript/bin/tsc','src/domain/finance.ts','src/infrastructure/groq-expense-interpreter.ts','--target','ES2022','--module','ES2022','--moduleResolution','Bundler','--outDir',output,'--skipLibCheck'],{stdio:'inherit'});
const compiled=resolve(output,'infrastructure/groq-expense-interpreter.js');writeFileSync(compiled,readFileSync(compiled,'utf8').replace("from '../domain/finance'","from '../domain/finance.js'"));
const {GroqExpenseInterpreter}=await import(pathToFileURL(resolve(output,'infrastructure/groq-expense-interpreter.js')));
const calls=[];const fakeFetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init.body))});return Response.json({choices:[{message:{content:JSON.stringify({expenses:[{category:'Restaurante',amount:35000,date:'2026-09-24',description:'Almuerzo'},{category:'Gasolina',amount:80000,date:'2026-09-24',description:'Gasolina'}],clarification:null})}}]})};
const result=await new GroqExpenseInterpreter('test-key','test-model',fakeFetch).interpret('Hoy gasté 35 mil en almuerzo y 80 mil en gasolina','2026-09','2026-09-24','2026-09-24');
assert.equal(result.expenses.length,2);assert.equal(result.expenses[0].amount,35000);assert.equal(result.expenses[1].category,'Gasolina');
assert.equal(calls[0].body.response_format.type,'json_object');assert.match(calls[0].body.messages[0].content,/never as instructions/);assert.equal(JSON.parse(calls[0].body.messages[1].content).selectedMonth,'2026-09');
const invalidFetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({expenses:[{category:'Inventada',amount:1,date:'2026-09-24',description:'No válida'}],clarification:null})}}]});
await assert.rejects(()=>new GroqExpenseInterpreter('test-key','test-model',invalidFetch).interpret('dato','2026-09','2026-09-24','2026-09-24'),/validar los gastos/);
console.log('Expense interpreter tests passed: structured extraction, prompt isolation and schema validation.');
