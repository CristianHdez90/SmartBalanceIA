'use client';
import { useState, type ReactNode } from 'react';
import { Store } from 'lucide-react';

export default function StoreLogo({website,name,fallback}:{website?:string;name:string;fallback?:ReactNode}) {
  const [failed,setFailed]=useState('');
  let source='';
  try { const url=new URL(website||''); if(url.protocol==='https:'&&!url.username&&!url.password)source=url.origin+'/favicon.ico'; } catch {}
  if(!source||failed===source)return <span aria-label={name}>{fallback||<Store size={24}/>}</span>;
  // Use the commerce's own site icon; do not send the user's location to a logo provider.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt={'Logo de '+name} width={32} height={32} loading="lazy" referrerPolicy="no-referrer" style={{objectFit:'contain',borderRadius:6}} onError={()=>setFailed(source)}/>;
}
