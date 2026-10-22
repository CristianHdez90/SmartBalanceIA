'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {InboxNotification} from '../domain/notification-inbox';
export function useNotificationSound(){
 const audio=useRef<AudioContext|null>(null),seen=useRef<Set<string>|null>(null),pending=useRef(false),lastPlayed=useRef(0);
 const [soundStatus,setSoundStatus]=useState('Activando sonido automático…');
 const play=useCallback(()=>{
  const context=audio.current;
  if(document.hidden||!context||context.state!=='running'){pending.current=true;return;}
  pending.current=false;if(Date.now()-lastPlayed.current<2500)return;
  try{for(const [delay,frequency] of [[0,660],[0.18,880]]){
   const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
   oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.16,start+0.02);gain.gain.exponentialRampToValueAtTime(0.001,start+0.4);
   oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+0.42);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }lastPlayed.current=Date.now();}catch{pending.current=true;setSoundStatus('El sonido se reintentará con tu próxima interacción.');}
 },[]);
 const unlock=useCallback(async()=>{
  try{const Audio=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Audio){setSoundStatus('Este navegador no admite el sonido de la campana.');return;}
   if(!audio.current||audio.current.state==='closed')audio.current=new Audio();
   const context=audio.current;
   if(context.state==='suspended')await context.resume();
   if(audio.current!==context)return;
   setSoundStatus(audio.current.state==='running'?'Sonido habilitado en esta página.':'El sonido se habilitará al hacer clic o pulsar una tecla en la plataforma.');
   if(pending.current)play();
  }catch{setSoundStatus('El sonido se habilitará al hacer clic o pulsar una tecla en la plataforma.');}
 },[play]);
 useEffect(()=>{
  const initial=setTimeout(()=>void unlock(),0);
  const gesture=()=>{void unlock();};
  const visibility=()=>{if(!document.hidden&&pending.current)void unlock();};
  const received=new Set<string>();
  const push=(event:MessageEvent)=>{if(event.data?.type!=='balance-push-received'||typeof event.data.tag!=='string'||received.has(event.data.tag))return;received.add(event.data.tag);play();if(pending.current&&!document.hidden)void unlock();};
  window.addEventListener('pointerdown',gesture);window.addEventListener('keydown',gesture);document.addEventListener('visibilitychange',visibility);navigator.serviceWorker?.addEventListener('message',push);
  return()=>{clearTimeout(initial);window.removeEventListener('pointerdown',gesture);window.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);navigator.serviceWorker?.removeEventListener('message',push);void audio.current?.close().catch(()=>{});audio.current=null;};
 },[unlock,play]);
 const notifySound=useCallback((items:InboxNotification[])=>{
  const previous=seen.current,fresh=previous!==null&&items.some(n=>n.active&&n.readAt===null&&!previous.has(n.id));
  seen.current??=new Set();for(const n of items)seen.current.add(n.id);if(fresh){play();if(pending.current&&!document.hidden)void unlock();}
 },[play,unlock]);
 const testSound=useCallback(async()=>{await unlock();play();},[unlock,play]);
 return {notifySound,testSound,soundStatus};
}
