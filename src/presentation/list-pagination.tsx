'use client';
import {useState} from 'react';
import './list-pagination.css';
export function pageWindow(total:number,size:number,page:number){const pages=Math.max(1,Math.ceil(total/size));const current=Math.max(1,Math.min(page,pages));return {page:current,pages,start:(current-1)*size,end:Math.min(current*size,total)};}
export function usePagination<T>(items:T[],resetKey:string,focusIndex=-1,last=false){
 resetKey=resetKey+':focus:'+focusIndex;
 const [state,setState]=useState({key:resetKey,page:focusIndex>=0?Math.floor(focusIndex/10)+1:last?Math.max(1,Math.ceil(items.length/10)):1,size:10});
 const initial=focusIndex>=0?Math.floor(focusIndex/state.size)+1:last?Math.ceil(items.length/state.size):1;
 if(state.key!==resetKey)setState({...state,key:resetKey,page:Math.max(1,initial)});
 const range=pageWindow(items.length,state.size,state.key===resetKey?state.page:initial);
 return {...range,total:items.length,size:state.size,items:items.slice(range.start,range.end),setPage:(page:number)=>setState({...state,key:resetKey,page}),setSize:(size:number)=>setState({key:resetKey,page:1,size})};
}
type Pager={page:number;pages:number;start:number;end:number;total:number;size:number;setPage:(page:number)=>void;setSize:(size:number)=>void};
export default function ListPagination({pager,label,disabled=false}:{pager:Pager;label:string;disabled?:boolean}){
 return <nav className="list-pagination" aria-label={'Paginación de '+label}><span aria-live="polite">{pager.total?pager.start+1:0}–{pager.end} de {pager.total}</span><label>Por página <select aria-label={'Registros por página de '+label} value={pager.size} disabled={disabled} onChange={e=>pager.setSize(Number(e.target.value))}>{[5,10,20,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label><div><button type="button" disabled={disabled||pager.page===1} onClick={()=>pager.setPage(pager.page-1)}>Anterior</button><span>Página {pager.page} de {pager.pages}</span><button type="button" disabled={disabled||pager.page===pager.pages} onClick={()=>pager.setPage(pager.page+1)}>Siguiente</button></div></nav>;
}
