import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('push arrival sounds in background and blocked audio is replayed after interaction',async()=>{
 const effects=[],listeners=new Map();let starts=0;
 class Audio{state='suspended';currentTime=0;destination={};async resume(){this.state='running'}async close(){this.state='closed'}createOscillator(){return{frequency:{},connect(){},start(){starts++},stop(){},disconnect(){}}}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}}
 const surface={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 const globals={window:globalThis.window,document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 Object.assign(globalThis,{window:{...surface,AudioContext:Audio},document:{...surface,hidden:true}});Object.defineProperty(globalThis,'navigator',{value:{serviceWorker:surface},configurable:true});
 try{const source=readFileSync(new URL('../src/presentation/notification-sound.ts',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const module={exports:{}};new Function('require','module','exports',code)(()=>({useRef:v=>({current:v}),useState:v=>[v,()=>{}],useCallback:fn=>fn,useEffect:fn=>effects.push(fn)}),module,module.exports);
 const hook=module.exports.useNotificationSound();const cleanups=effects.map(fn=>fn());
 listeners.get('message')({data:{type:'balance-push-received',tag:'delivery-1'}});
 assert.equal(starts,0);
 listeners.get('pointerdown')();await Promise.resolve();await Promise.resolve();assert.equal(starts,2);
 listeners.get('message')({data:{type:'balance-push-received',tag:'delivery-1'}});assert.equal(starts,2);
 hook.notifySound([{id:'old',active:true,readAt:null}]);assert.equal(starts,2);
 cleanups.forEach(fn=>fn());
 }finally{for(const name of ['window','document']){if(globals[name]===undefined)delete globalThis[name];else globalThis[name]=globals[name];}if(globals.navigator)Object.defineProperty(globalThis,'navigator',globals.navigator);else delete globalThis.navigator;}
});
