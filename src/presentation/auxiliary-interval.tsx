'use client';
import { useEffect, useState } from 'react';
import { notificationIntervalKey, readNotificationInterval } from './notification-refresh';

export default function AuxiliaryInterval({userId}:{userId:string}) {
  const [seconds,setSeconds]=useState(60),[error,setError]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSeconds(readNotificationInterval(userId)),0);return()=>clearTimeout(timer);},[userId]);
  function change(value:number) {
    try {
      localStorage.setItem(notificationIntervalKey(userId),String(value));setSeconds(value);setError('');
      window.dispatchEvent(new CustomEvent('balance-notification-interval',{detail:{userId}}));
    }catch {setError('No se pudo guardar el intervalo en este navegador.');}
  }
  return <>
    <label>Frecuencia de actualización de notificaciones<select value={seconds} onChange={e=>change(Number(e.target.value))}>
      <option value={0}>Desactivar actualización automática</option><option value={30}>Cada 30 segundos</option><option value={60}>Cada 1 minuto</option><option value={600}>Cada 10 minutos</option><option value={1200}>Cada 20 minutos</option><option value={1800}>Cada 30 minutos</option><option value={3600}>Cada hora</option>
    </select></label>
    <small>Elige cada cuánto actualizar la campana mientras usas la plataforma. Al desactivar, podrás seguir consultándola al abrirla. Tu preferencia se guarda automáticamente en este navegador.</small>
    {error&&<p role="alert">{error}</p>}
  </>;
}
