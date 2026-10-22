'use client';
import type { DeviceReminder } from '../domain/reminders';

type NativeWindow = Window & { miBalanceReminders?: number; ReactNativeWebView?: { postMessage: (value: string) => void } };
export function isNativeApp() { return typeof window !== 'undefined' && typeof (window as NativeWindow).ReactNativeWebView?.postMessage === 'function'; }
export function supportsDeviceReminders() { return isNativeApp() && (window as NativeWindow).miBalanceReminders! >= 1; }
export function clearDeviceReminders() {
  if((window as NativeWindow).miBalanceReminders===2)(window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({type:'mi-balance-push',action:'clear',id:crypto.randomUUID()}));
  (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'mi-balance-reminders', action: 'clear', id: crypto.randomUUID() }));
}
export function syncDeviceReminders(userId: string, plan: DeviceReminder[], action: 'sync' | 'enable' | 'disable' | 'test' = 'sync') {
  if((window as NativeWindow).miBalanceReminders===2)return syncNativePush(userId,action);
  return new Promise<{ enabled: boolean; count: number }>((resolve, reject) => {
    if (!supportsDeviceReminders()) { reject(new Error('Instala la nueva versión de la app para activar avisos en este dispositivo.')); return; }
    const id = crypto.randomUUID();
    const result = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data?.id !== id) return;
      clearTimeout(timer); window.removeEventListener('mi-balance-reminders-result', result);
      if (data.error) reject(new Error(data.error)); else resolve({ enabled: !!data.enabled, count: Number(data.count || 0) });
    };
    const timer = setTimeout(() => { window.removeEventListener('mi-balance-reminders-result', result); reject(new Error('El dispositivo no confirmó los avisos. Vuelve a sincronizar.')); }, 45000);
    window.addEventListener('mi-balance-reminders-result', result);
    (window as NativeWindow).ReactNativeWebView!.postMessage(JSON.stringify({ type: 'mi-balance-reminders', id, action, userId, plan }));
  });
}

async function syncNativePush(userId:string,action:string):Promise<{enabled:boolean;count:number}>{
 const result=await new Promise<{enabled:boolean;token?:string;error?:string}>((resolve,reject)=>{
 const id=crypto.randomUUID();const listener=(event:Event)=>{const data=(event as CustomEvent).detail;if(data?.id!==id)return;clearTimeout(timer);window.removeEventListener('mi-balance-push-result',listener);resolve(data);};
 const timer=setTimeout(()=>{window.removeEventListener('mi-balance-push-result',listener);reject(new Error('El dispositivo no confirmó la activación.'));},45000);
 window.addEventListener('mi-balance-push-result',listener);(window as NativeWindow).ReactNativeWebView!.postMessage(JSON.stringify({type:'mi-balance-push',id,userId,action}));
 });
 if(result.error)throw new Error(result.error);
 if(!result.token)return {enabled:false,count:0};
 async function api(action:string){const r=await fetch('/api/native-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:result.token})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
 if(action==='disable'){await api('unsubscribe');return {enabled:false,count:0};}
 if(!result.enabled)return {enabled:false,count:0};
 await api('subscribe');if(action==='test')await api('test');return {enabled:true,count:0};
}
