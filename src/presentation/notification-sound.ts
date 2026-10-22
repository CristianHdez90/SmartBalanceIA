'use client';
import {useCallback,useEffect,useRef} from 'react';
import type {InboxNotification} from '../domain/notification-inbox';

export function useNotificationSound(){
 const audio=useRef<AudioContext|null>(null);
 const seen=useRef<Set<string>|null>(null);
 useEffect(()=>{
  const unlock=()=>{
   try{
    const Audio=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Audio)return;
    audio.current??=new Audio();
    if(audio.current.state==='suspended')void audio.current.resume().catch(()=>{});
   }catch{/* Audio support is optional; the inbox remains usable. */}
  };
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void audio.current?.close().catch(()=>{});audio.current=null;};
 },[]);
 return useCallback((items:InboxNotification[])=>{
  // The initial history is silent. Only newly arriving unread notices chime.
  const previous=seen.current;
  const fresh=previous!==null&&items.some(n=>n.active&&n.readAt===null&&!previous.has(n.id));
  seen.current??=new Set();for(const n of items)seen.current.add(n.id);
  const context=audio.current;
  if(!fresh||document.hidden||!context||context.state!=='running')return;
  try{
   for(const [delay,frequency] of [[0,660],[0.16,880]]){
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
    oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.08,start+0.015);gain.gain.exponentialRampToValueAtTime(0.001,start+0.28);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+0.3);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   }
  }catch{/* A browser audio restriction must not interrupt notification delivery. */}
 },[]);
}
