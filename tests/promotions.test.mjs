import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){const {outputText}=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});const m={exports:{}};new Function('require','module','exports',outputText)(n=>deps[n]??require(n),m,m.exports);return m.exports;}
const domain=load('src/domain/promotions.ts');const service=load('src/application/promotion-service.ts');
const {OverpassNearbyStoreFinder}=load('src/infrastructure/openstreetmap-location.ts',{'../domain/promotions':domain,'../application/promotion-service':service});
const {GroqPromotionFinder}=load('src/infrastructure/groq-promotion-finder.ts',{'../application/promotion-service':service});
test('3 km excludes centers beyond boundary before rounding and sorts all candidates',async()=>{const finder=new OverpassNearbyStoreFinder(async(u,opts)=>{assert.ok(!decodeURIComponent(opts.body).includes('tags 60'));return Response.json({elements:[{id:1,lat:0,lon:.04,tags:{name:'Far'}},{id:2,lat:0,lon:.01,tags:{name:'Near'}}]});});const found=await finder.find(0,0,3000);assert.deepEqual(found.map(s=>s.name),['Near']);});
test('rejects expired, future, unknown validity and unrelated stores; never restores old search snippets',async()=>{const row={product:'Oferta',store:'Supermu',sourceUrl:'https://example.com/oferta',validFrom:'2026-10-01',validUntil:'2026-10-31'};const finder=new GroqPromotionFinder('test',async()=>Response.json({choices:[{message:{content:JSON.stringify({promotions:[row,{...row,validUntil:'2026-09-30'},{...row,validFrom:'2026-11-01'},{...row,validUntil:''},{...row,store:'Other'}]}),executed_tools:[{search_results:{results:[{title:'Old',url:'https://example.com/old'}]}}]}}]}));assert.equal((await finder.find([{name:'Supermu'}],'2026-10-22')).promotions.length,1);assert.equal((await finder.find([{name:'Supermu'}],'2027-10-22')).promotions.length,0);});
test('cache expires after fifteen minutes and does not reuse nearby coordinate keys',async()=>{let calls=0;const map=new Map();let now=new Date('2026-10-22T15:00:00Z');const svc=new service.PromotionService({find:async k=>map.get(k),save:async(k,d,v)=>map.set(k,v)},{},{find:async()=>{calls++;return [];}},{find:async()=>({promotions:[],note:''})},()=>now);const input={action:'search',latitude:4,longitude:-74,radiusKm:3};await svc.execute(input);await svc.execute(input);assert.equal(calls,1);now=new Date('2026-10-22T15:16:00Z');await svc.execute(input);assert.equal(calls,2);await svc.execute({...input,latitude:4.0001});assert.equal(calls,3);});

test('pharmacies expose available branch contact details',async()=>{
 const finder=new OverpassNearbyStoreFinder(async(u,opts)=>{assert.match(decodeURIComponent(opts.body),/pharmacy/);return Response.json({elements:[{id:3,type:'node',lat:0,lon:0,tags:{name:'Droguería Centro',amenity:'pharmacy',website:'https://example.com','addr:city':'Bogotá','addr:street':'Calle 10','addr:housenumber':'20',phone:'+57 123456'}}]});});
 const [store]=await finder.find(0,0,3000);
 assert.equal(store.type,'Droguería');assert.equal(store.website,'https://example.com');assert.equal(store.city,'Bogotá');assert.equal(store.address,'Calle 10 20');assert.equal(store.phone,'+57 123456');
});
