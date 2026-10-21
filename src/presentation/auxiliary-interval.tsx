'use client';
import { useEffect, useState } from 'react';
import type { ReminderSettings } from '../domain/reminders';

export default function AuxiliaryInterval({userId,value,onChange,visible}:{userId:string;value:ReminderSettings['auxiliaryMinutes'];onChange:(value:ReminderSettings['auxiliaryMinutes'])=>void;visible:boolean}) {
  const [local,setLocal]=useState(false),[seconds,setSeconds]=useState(0),[running,setRunning]=useState(false),[status,setStatus]=useState('');
  const storageKey=`balance-local-reminder-interval:${userId}`;
  useEffect(()=>{
    const timer=setTimeout(()=>{
      setLocal(process.env.NODE_ENV==='development' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname));
      try {const saved=Number(localStorage.getItem(storageKey));if([30,60,600,1200].includes(saved))setSeconds(saved);}catch{}
    },0);
    return()=>clearTimeout(timer);
  },[storageKey]);
  useEffect(()=>{
    if(!running || !seconds || !local || !visible)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    async function tick() {
      if(stopped)return;
      if(!document.hidden) {
        try {
          const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription();
          if(stopped)return;
          if(!subscription)throw new Error('Activa las notificaciones web en este navegador antes de iniciar la prueba.');
          const r=await fetch('/api/web-push/local-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds,endpoint:subscription.endpoint})}),result=await r.json();
          if(!r.ok)throw new Error(result.error??'No se pudo completar la revisión.');
          if(!stopped)setStatus(`Revisión ${new Date().toLocaleTimeString('es-CO')}: ${result.sent} aviso(s) enviado(s).`);
        }catch(e){if(!stopped){setStatus((e as Error).message);setRunning(false);}return;}
      }
      if(!stopped)timer=setTimeout(()=>void tick(),seconds*1000);
    }
    timer=setTimeout(()=>void tick(),seconds*1000);
    return()=>{stopped=true;clearTimeout(timer);};
  },[running,seconds,local,visible]);
  function change(next:string) {
    setRunning(false);setStatus('');
    const test=next.startsWith('test:')?Number(next.slice(5)):0;
    setSeconds(test);
    try{if(test)localStorage.setItem(storageKey,String(test));else localStorage.removeItem(storageKey);}catch{}
    if(!test)onChange(Number(next) as ReminderSettings['auxiliaryMinutes']);
  }
  return <>
    <label>Revisión auxiliar de GitHub Actions<select value={local&&seconds?`test:${seconds}`:value} onChange={e=>change(e.target.value)}>
      <option value={0}>Desactivada</option>
      {local&&<optgroup label="Pruebas locales"><option value="test:30">Cada 30 segundos (prueba local)</option><option value="test:60">Cada 1 minuto (prueba local)</option><option value="test:600">Cada 10 minutos (prueba local)</option><option value="test:1200">Cada 20 minutos (prueba local)</option></optgroup>}
      <option value={30}>Cada 30 minutos</option><option value={60}>Cada hora</option><option value={120}>Cada 2 horas</option><option value={360}>Cada 6 horas</option><option value={1440}>Cada 24 horas</option>
    </select></label>
    {local&&seconds>0&&<div><small>Prueba guardada solo en este navegador. No cambia GitHub ni el intervalo del servidor. Con esta sección visible, se revisan los avisos de este navegador cada {seconds<60?'30 segundos':`${seconds/60} minuto(s)`}. Se respeta la hora guardada y el límite de un resumen diario; revisar no significa enviar otro aviso.</small>
      <div className="reminder-actions"><button type="button" className="secondary" onClick={()=>{setStatus('');setRunning(v=>!v);}}>{running?'Detener prueba local':'Iniciar prueba local'}</button></div><p role="status">{status||(running?'Prueba activa. La primera revisión ocurrirá al finalizar el intervalo.':'Prueba detenida.')}</p>
    </div>}
  </>;
}
