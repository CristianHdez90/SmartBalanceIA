'use client';
import ListPagination, {usePagination} from './list-pagination';
import {useCallback,useEffect,useState} from 'react';
import type {InboxNotification} from '../domain/notification-inbox';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import './notification-page.css';

export default function NotificationPage({onNavigate}:{onNavigate:(section:string,target?:{id:string;month?:string})=>void}){
 const [items,setItems]=useState<InboxNotification[]>([]),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<string[]>([]),[detail,setDetail]=useState<InboxNotification|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{try{const r=await fetch('/api/notifications',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error);setItems(data.items);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function change(method:'POST'|'DELETE',body:unknown){setBusy(true);setError('');try{const r=await fetch('/api/notifications',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();if(!r.ok)throw Error(data.error);setItems(data.items);window.dispatchEvent(new Event('balance-inbox-changed'));return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 async function open(item:InboxNotification){setDetail(item);if(item.readAt===null)await change('POST',{id:item.id});}
 async function remove(ids:string[]){if(!window.confirm(`¿Eliminar ${ids.length} notificación(es)? Los pagos y promociones registrados se conservan.`))return;for(let i=0;i<ids.length;i+=100){if(!await change('DELETE',{ids:ids.slice(i,i+100)}))return;}setSelected([]);}
 const unread=items.filter(n=>n.readAt===null).length;
 const visible=items.filter(n=>filter==='all'||(filter==='unread'?n.readAt===null:n.readAt!==null));
 const pager=usePagination(visible,filter);
 const allSelected=visible.length>0&&pager.items.every(n=>selected.includes(n.id));
 return <section className="notification-page"><header><h1>Notificaciones</h1><p>Consulta tus avisos de pagos y promociones.</p></header>
 <nav aria-label="Filtrar notificaciones">{[['all',`Todas (${items.length})`],['unread',`Sin leer (${unread})`],['read',`Leídas (${items.length-unread})`]].map(([id,label])=><button className={filter===id?'primary':'secondary'} key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setSelected([]);}}>{label}</button>)}</nav>
 <div className="notification-page-toolbar"><label><input type="checkbox" checked={allSelected} disabled={busy||!visible.length} onChange={e=>setSelected(ids=>e.target.checked?[...new Set([...ids,...pager.items.map(n=>n.id)])]:ids.filter(id=>!pager.items.some(n=>n.id===id)))}/> Seleccionar esta página</label><button className="secondary" disabled={busy||!selected.length} onClick={()=>void remove(selected)}>Eliminar seleccionadas ({selected.length})</button><button className="secondary" disabled={busy} onClick={()=>void load()}>Actualizar</button></div>
 {error&&<p role="alert">{error}</p>}{loading?<p>Cargando notificaciones…</p>:!visible.length?<p>No hay notificaciones en esta lista.</p>:pager.items.map(n=><article key={n.id} className={n.readAt===null?'unread':''}><input type="checkbox" aria-label={'Seleccionar '+n.title} disabled={busy} checked={selected.includes(n.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,n.id]:ids.filter(id=>id!==n.id))}/><button className="notification-page-item" disabled={busy} onClick={()=>void open(n)}><strong>{n.readAt===null&&<span aria-label="Sin leer">● </span>}{n.kind==='promotion'?'🛒':'📅'} {n.title}</strong><small>{n.day.split('-').reverse().join('/')} · {n.readAt===null?'Sin leer':'Leída'}{!n.active?' · Historial':''}</small></button><button className="secondary" disabled={busy} aria-label={'Eliminar '+n.title} onClick={()=>void remove([n.id])}>Eliminar</button></article>)}
 <ListPagination pager={pager} label="notificaciones" disabled={busy||loading}/>
 <Dialog open={!!detail} onOpenChange={v=>{if(!v)setDetail(null);}}><DialogContent className="editor"><DialogTitle>{detail?.title}</DialogTitle><DialogDescription>{detail?.day} · Detalle del aviso</DialogDescription><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{detail?.body}</p>{error&&<p role="alert">{error}</p>}<button className="primary" onClick={()=>{if(detail)onNavigate(detail.section,detail.kind==='promotion'?{id:detail.id.slice(10,-11)}:detail.targetId&&detail.targetMonth?{id:detail.targetId,month:detail.targetMonth}:undefined);setDetail(null);}}>{detail?.kind==='promotion'?'Ver supermercado':'Ver obligación'}</button></DialogContent></Dialog>
 </section>;
}
