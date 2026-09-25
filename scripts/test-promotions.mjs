import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const output=resolve('.sites-runtime/promotion-tests');
for(const file of ['domain/promotions','application/promotion-service','infrastructure/openstreetmap-location','infrastructure/groq-promotion-finder']){
  const source=readFileSync(resolve('src',file+'.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '(\.\.?\/[^']+)'/g,"from '$1.js'");
  mkdirSync(dirname(resolve(output,file+'.js')),{recursive:true});
  writeFileSync(resolve(output,file+'.js'),js);
}

const {PromotionService}=await import(pathToFileURL(resolve(output,'application/promotion-service.js')));
const {NominatimGeocoder,OverpassNearbyStoreFinder}=await import(pathToFileURL(resolve(output,'infrastructure/openstreetmap-location.js')));
const {GroqPromotionFinder}=await import(pathToFileURL(resolve(output,'infrastructure/groq-promotion-finder.js')));

let storeCalls=0,promotionCalls=0;
const saved=[];
const cache={async find(key,date){return saved.find(row=>row.key===key&&row.date===date)?.value??null},async save(key,date,value){saved.push({key,date,value})}};
const geocoder={async locate(query){return {latitude:4.65,longitude:-74.05,label:query}}};
const stores={async find(){storeCalls++;return [{id:'store-1',name:'Tienda Ejemplo',type:'Supermercado',distanceKm:0.4,latitude:4.651,longitude:-74.05,address:''}]}};
const promotions={async find(found,date){promotionCalls++;assert.equal(found[0].name,'Tienda Ejemplo');assert.equal(date,'2026-09-24');return {promotions:[],note:'Sin ofertas'}}};
const service=new PromotionService(cache,geocoder,stores,promotions,()=>new Date('2026-09-24T15:00:00Z'));
assert.deepEqual(await service.execute({action:'geocode',query:'Chapinero, Bogotá'}),{latitude:4.65,longitude:-74.05,label:'Chapinero, Bogotá'});
const first=await service.execute({action:'search',latitude:4.65,longitude:-74.05,radiusKm:3});
assert.equal(first.fromCache,false);assert.equal(storeCalls,1);assert.equal(promotionCalls,1);assert.equal(saved.length,1);
const second=await service.execute({action:'search',latitude:4.65,longitude:-74.05,radiusKm:3});
assert.equal(second.fromCache,true);assert.equal(storeCalls,1);assert.equal(promotionCalls,1);
await service.execute({action:'search',latitude:4.65,longitude:-74.05,radiusKm:3,refresh:true});
assert.equal(storeCalls,2);assert.equal(promotionCalls,2);
await assert.rejects(()=>service.execute({action:'search',latitude:91,longitude:-74,radiusKm:3}));
await assert.rejects(()=>service.execute({action:'geocode',query:'x'}));

let nominatimUrl='';
const nominatim=new NominatimGeocoder(async url=>{nominatimUrl=String(url);return new Response(JSON.stringify([{lat:'4.65',lon:'-74.05',display_name:'Chapinero, Bogotá, Colombia'}]),{status:200})});
const located=await nominatim.locate('Chapinero, Bogotá');
assert.equal(located.latitude,4.65);assert.ok(nominatimUrl.includes('countrycodes=co'));assert.ok(nominatimUrl.includes('Chapinero'));

let overpassAttempts=0;
const overpass=new OverpassNearbyStoreFinder(async(_url,options)=>{overpassAttempts++;assert.equal(options.method,'POST');assert.ok(String(options.body).includes('supermarket'));if(overpassAttempts===1)return new Response('ocupado',{status:504});return new Response(JSON.stringify({elements:[{type:'node',id:2,lat:4.66,lon:-74.05,tags:{amenity:'fuel',name:'Estación B'}},{type:'node',id:1,lat:4.651,lon:-74.05,tags:{shop:'supermarket',name:'Mercado A','addr:street':'Calle 1'}}]}),{status:200})});
const nearby=await overpass.find(4.65,-74.05,3000);
assert.equal(overpassAttempts,2);assert.equal(nearby.length,2);assert.equal(nearby[0].name,'Mercado A');assert.equal(nearby[0].type,'Supermercado');assert.equal(nearby[1].type,'Estación de gasolina');

let groqBody;
const groq=new GroqPromotionFinder('test-key',async(_url,options)=>{groqBody=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({promotions:[{product:'Arroz 1 kg',store:'Mercado A',offer:'20% de descuento',promoPrice:'$ 8.000',regularPrice:'$ 10.000',discount:'20%',validUntil:'2026-09-25',conditions:'Hasta agotar existencias',sourceUrl:'https://example.com/promocion'}]})}}]}),{status:200})});
const found=await groq.find(nearby,'2026-09-24');
assert.equal(found.promotions.length,1);assert.equal(found.promotions[0].product,'Arroz 1 kg');assert.equal(groqBody.model,'openai/gpt-oss-20b');assert.deepEqual(groqBody.tools,[{type:'browser_search'}]);assert.equal('citation_options' in groqBody,false);assert.ok(groqBody.messages[0].content.includes('datos no confiables'));

console.log('Promotions tests passed: daily cache, validation, geocoding, nearby stores and Groq contract.');
