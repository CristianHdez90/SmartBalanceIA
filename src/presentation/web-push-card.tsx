'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

async function request(body?: unknown) {
  const response=await fetch('/api/web-push',{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'No se pudo conectar con el servidor.');
  return result;
}
function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
export default function WebPushCard() {
  const [supported,setSupported]=useState(false),[key,setKey]=useState(''),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState('Verificando notificaciones web…'),[error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setMessage('Este navegador no admite avisos push. En iPhone (iOS 16.4 o posterior), añade esta web a la pantalla de inicio y ábrela desde su icono.'); return;
    }
    setSupported(true);
    const config=await request(); setKey(config.publicKey??'');
    if(!config.configured) { setMessage('Las notificaciones web están pendientes de la configuración del servidor.'); return; }
    const registration=await navigator.serviceWorker.getRegistration('/');
    const sub=await registration?.pushManager.getSubscription();
    const active=sub ? !!(await request({action:'status',endpoint:sub.endpoint})).enabled : false;
    setEnabled(active);
    setMessage(active ? 'Activadas en este navegador. Recibirás un resumen diario aunque cierres esta página.' : 'Activa los avisos para recibir un resumen de pagos y promociones en este navegador.');
  },[]);
  useEffect(()=>{ const timer=setTimeout(()=>void refresh().catch(e=>setError((e as Error).message)),0); return ()=>clearTimeout(timer); },[refresh]);
  async function act(action:'enable'|'disable'|'test'|'refresh') {
    setBusy(true);setError('');
    try {
      if(action==='refresh') { await refresh(); return; }
      if(action==='enable') {
        // Permission must originate from this click, before registration/network awaits (Safari).
        const permission=await Notification.requestPermission();
        if(permission!=='granted') throw new Error('Permiso no concedido. Puedes habilitar las notificaciones en los ajustes de este sitio en tu navegador.');
        await navigator.serviceWorker.register('/push-sw.js',{scope:'/',updateViaCache:'none'});
        const registration=await navigator.serviceWorker.ready;
        const previous=await registration.pushManager.getSubscription();
        if(previous) { await request({action:'unsubscribe',endpoint:previous.endpoint}); await previous.unsubscribe(); }
        const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
        try { await request({action:'subscribe',subscription:subscription.toJSON()}); }
        catch(e) { await subscription.unsubscribe(); throw e; }
        setEnabled(true);setMessage('Notificaciones web activadas. Puedes enviar un aviso de prueba.');
      } else {
        const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription();
        if(!subscription) { setEnabled(false); throw new Error('No hay una suscripción activa. Activa las notificaciones nuevamente.'); }
        await request({action:action==='test'?'test':'unsubscribe',endpoint:subscription.endpoint});
        if(action==='disable') {
          await subscription.unsubscribe();
          for(const notification of await registration!.getNotifications()) notification.close();
          setEnabled(false);setMessage('Notificaciones desactivadas en este navegador.');
        } else setMessage('Prueba enviada al servicio push. Revisa las notificaciones del dispositivo.');
      }
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <article><h2><Bell size={20}/> Notificaciones web</h2><p role="status">{message}</p>{error&&<p className="auth-error" role="alert">{error}</p>}
    <div className="reminder-actions"><button className="primary" disabled={busy||!supported||!key} onClick={()=>void act(enabled?'disable':'enable')}>{enabled?'Desactivar en este navegador':'Activar notificaciones web'}</button>{enabled&&<button className="secondary" disabled={busy} onClick={()=>void act('test')}>Probar aviso</button>}<button className="secondary" disabled={busy} onClick={()=>void act('refresh')}>{busy?'Procesando…':'Comprobar estado'}</button></div>
    <small>Un resumen diario a partir de la hora elegida en Preferencias (Colombia). Vercel revisa cerca de las 8:00 a. m. y GitHub Actions cada 30 minutos como apoyo; puede haber retrasos. No muestra montos ni nombres. Al cerrar sesión o vencer la sesión se detienen los avisos; vuelve a activarlos al iniciar sesión.</small>
  </article>;
}
