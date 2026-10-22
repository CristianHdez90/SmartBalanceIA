'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover,PopoverContent,PopoverTrigger } from '@/components/ui/popover';
import { Dialog,DialogContent,DialogDescription,DialogTitle } from '@/components/ui/dialog';
import type { InboxNotification } from '../domain/notification-inbox';
import { notificationIntervalKey,readNotificationInterval } from './notification-refresh';
import './notification-bell.css';
import {useNotificationSound} from './notification-sound';

export default function NotificationBell({userId,onChange,revision}:{userId:string;onChange:(section:string,target?:{id:string;month?:string})=>void;revision:unknown}) {
  const {notifySound,testSound,soundStatus}=useNotificationSound();
  const [items,setItems]=useState<InboxNotification[]>([]),[unread,setUnread]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [open,setOpen]=useState(false),[selected,setSelected]=useState<InboxNotification|null>(null);
  const generation=useRef(0),marking=useRef(false),request=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(document.hidden||marking.current)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;const seq=++generation.current;
    try {
      const r=await fetch('/api/notifications',{cache:'no-store',signal:controller.signal}),data=await r.json();
      if(!r.ok)throw new Error(data.error);
      if(controller.signal.aborted||seq!==generation.current)return;
      notifySound(data.items);setItems(data.items);setUnread(data.unread);setError('');
      const seconds=data.repeatSeconds===86400?60:data.repeatSeconds;
      if(typeof seconds==='number'&&seconds!==readNotificationInterval(userId)){try{localStorage.setItem(notificationIntervalKey(userId),String(seconds));}catch{}window.dispatchEvent(new CustomEvent('balance-notification-interval',{detail:{userId}}));}
      if(data.repeatSeconds>0){const push=await fetch('/api/web-push/check',{method:'POST',signal:controller.signal});if(!push.ok){const failure=await push.json();throw new Error(failure.error||'No se pudieron enviar los avisos.');}}
    }catch(e){if(!controller.signal.aborted&&seq===generation.current)setError((e as Error).message);}
    finally {if(seq===generation.current)setLoading(false);}
  },[userId,notifySound]);
  useEffect(()=>{
    let timer:ReturnType<typeof setInterval>|undefined;
    const reset=()=>{if(timer)clearInterval(timer);const seconds=readNotificationInterval(userId);if(seconds)timer=setInterval(()=>void refresh(),seconds*1000);};
    const changed=(event:Event)=>{if((event as CustomEvent).detail?.userId===userId)reset();};
    const storage=(event:StorageEvent)=>{if(event.key===notificationIntervalKey(userId))reset();};
    const update=()=>void refresh();reset();const initial=setTimeout(update,0);
    window.addEventListener('balance-notification-interval',changed);window.addEventListener('storage',storage);window.addEventListener('balance-reminders-changed',update);window.addEventListener('balance-inbox-changed',update);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{clearTimeout(initial);if(timer)clearInterval(timer);request.current?.abort();window.removeEventListener('balance-notification-interval',changed);window.removeEventListener('storage',storage);window.removeEventListener('balance-reminders-changed',update);window.removeEventListener('balance-inbox-changed',update);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[userId,refresh]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),300);return()=>clearTimeout(timer);},[revision,refresh]);
  async function show(item:InboxNotification) {
    setOpen(false);setSelected(item);setError('');
    if(item.readAt!==null)return;
    marking.current=true;request.current?.abort();++generation.current;
    try {
      const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})}),data=await r.json();
      if(!r.ok)throw new Error(data.error);
      setItems(data.items);setUnread(data.unread);setSelected(previous=>previous?.id===item.id?data.items.find((n:InboxNotification)=>n.id===item.id)??previous:previous);
    }catch(e){setError((e as Error).message);}finally{marking.current=false;}
  }
  return <>
    <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)void refresh();}}><PopoverTrigger asChild><button className="balance-notifications" aria-label={`Notificaciones: ${unread} sin leer`}><span aria-hidden="true">🔔</span>{unread>0&&<span className="notification-count" aria-hidden="true">{unread>99?'99+':unread}</span>}</button></PopoverTrigger>
      <PopoverContent align="end" className="balance-alerts notification-inbox"><h2>Notificaciones {unread>0&&<span>({unread} sin leer)</span>}</h2>
        <button onClick={()=>{onChange('notifications');setOpen(false);}}>Ver todas las notificaciones</button><button onClick={()=>{onChange('reminders');setOpen(false);}}>Configurar notificaciones</button>
        <button onClick={()=>void testSound()}>🔊 Probar sonido</button><p role="status">{soundStatus}</p>{error&&<p role="alert">{error} <button onClick={()=>void refresh()}>Reintentar</button></p>}
        {loading?<p>Cargando notificaciones…</p>:items.length?<div className="notification-inbox-list">{items.map(item=><button key={item.id} onClick={()=>void show(item)} className={item.active&&item.readAt===null?'notification-unread':''}>
          <span>{item.active&&item.readAt===null&&<i className="notification-item-dot" aria-label="Sin leer"/>}{item.kind==='promotion'?'🛒':'📅'} {item.title}</span><small>{item.day.split('-').reverse().join('/')} · {!item.active?'Ya no vigente':item.readAt!==null?'Leída':'Sin leer'}</small>
        </button>)}</div>:!error&&<p>No hay notificaciones por mostrar.</p>}
      </PopoverContent>
    </Popover>
    <Dialog open={!!selected} onOpenChange={value=>{if(!value)setSelected(null);}}><DialogContent className="editor notification-detail"><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.day.split('-').reverse().join('/')} · {selected?.active?'Aviso vigente':'Aviso del historial'}</DialogDescription>
      <p className="notification-detail-body">{selected?.body}</p>{error&&<p role="alert" className="auth-error">{error}{selected&&<button className="secondary" onClick={()=>void show(selected)}>Marcar como leída</button>}</p>}
      <button className="primary" onClick={()=>{if(selected)onChange(selected.section,selected.kind==='promotion'?{id:selected.id.slice('promotion:'.length,-11)}:selected.targetId&&selected.targetMonth?{id:selected.targetId,month:selected.targetMonth}:undefined);setSelected(null);}}>{selected?.kind==='promotion'?'Ver promociones registradas':'Ver obligación'}</button>
    </DialogContent></Dialog>
  </>;
}
