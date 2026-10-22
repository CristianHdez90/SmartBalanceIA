'use client';

import { useState } from 'react';
import { AmountPrivacyToggle } from './amount-privacy';
import Link from 'next/link';
import { Users, LogOut, Menu, Wallet, Bell, ChevronDown, Inbox, Settings, ListChecks, ArrowLeftRight, ReceiptText } from 'lucide-react';
import './notification-navigation.css';
import NotificationBell from './notification-bell';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

export const balanceSections = [
  { id: 'overview', label: 'Resumen', glyph: '⊞' },
  { id: 'obligations', label: 'Obligaciones', glyph: '↕' },
  { id: 'expenses', label: 'Gastos diarios', glyph: '◎' },
  { id: 'goals', label: 'Metas', glyph: '◇' },
  { id: 'coach', label: 'Asistente IA', glyph: '✦' },
  { id: 'promotions', label: 'Promociones', glyph: '📍' },
  { id: 'notifications', label: 'Bandeja de notificaciones', glyph: '🔔' },
  { id: 'reminders', label: 'Preferencias de avisos', glyph: '🔔' },
];

export default function BalanceNavigation({ active, onChange, user, onAdmin, onLogout, notificationRevision }: {
  notificationRevision: unknown;
  active: string; onChange: (section: string,target?:{id:string;month?:string}) => void;
  user: { id: string; displayName: string; role: 'admin' | 'user' }; onAdmin: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const notificationActive = active === 'notifications' || active === 'reminders';
  const [group, setGroup] = useState<{section:string;expanded:boolean}|null>(null);
  const expanded = group?.section === active ? group.expanded : notificationActive;
  const obligationItems=[{id:'obligations',label:'Compromisos',Icon:ListChecks},{id:'movements',label:'Movimientos',Icon:ArrowLeftRight},{id:'report',label:'Reporte de pagos',Icon:ReceiptText}];
  const obligationActive=obligationItems.some(item=>item.id===active);
  const [obligationGroup,setObligationGroup]=useState<{section:string;expanded:boolean}|null>(null);
  const obligationsExpanded=obligationGroup?.section===active?obligationGroup.expanded:obligationActive;
  const expenseItems=[{id:'expenses',label:'Consumos',Icon:ListChecks},{id:'expense-movements',label:'Movimientos',Icon:ArrowLeftRight},{id:'expense-report',label:'Reporte por categorías',Icon:ReceiptText}];
  const expenseActive=expenseItems.some(item=>item.id===active);
  const [expenseGroup,setExpenseGroup]=useState<{section:string;expanded:boolean}|null>(null);
  const expensesExpanded=expenseGroup?.section===active?expenseGroup.expanded:expenseActive;
  const navigation = <>
    <Link href="/" className="balance-brand"><span><Wallet size={21}/></span>Mi Balance <b>IA</b></Link>
    <p className="balance-nav-label">TU ESPACIO FINANCIERO</p>
    <nav aria-label="Navegación principal">{balanceSections.filter(section=>section.id!=='notifications'&&section.id!=='reminders').map(({ id, label, glyph }) => id==='obligations'?<div key={id} className="notification-nav-group">
      <button type="button" aria-expanded={obligationsExpanded} className={obligationActive?'notification-nav-active':undefined} onClick={()=>setObligationGroup({section:active,expanded:!obligationsExpanded})}><ArrowLeftRight size={19} aria-hidden="true"/>Obligaciones<ChevronDown size={16} aria-hidden="true" className={'notification-nav-chevron'+(obligationsExpanded?' expanded':'')}/></button>
      {obligationsExpanded&&<div className="notification-nav-children" role="group" aria-label="Obligaciones">{obligationItems.map(({id,label,Icon})=><button type="button" key={id} aria-current={active===id?'page':undefined} onClick={()=>{onChange(id);setObligationGroup({section:id,expanded:true});setOpen(false);}}><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>}
    </div>:id==='expenses'?<div key={id} className="notification-nav-group"><button type="button" aria-expanded={expensesExpanded} className={expenseActive?'notification-nav-active':undefined} onClick={()=>setExpenseGroup({section:active,expanded:!expensesExpanded})}><Wallet size={19} aria-hidden="true"/>Gastos diarios<ChevronDown size={16} aria-hidden="true" className={'notification-nav-chevron'+(expensesExpanded?' expanded':'')}/></button>{expensesExpanded&&<div className="notification-nav-children" role="group" aria-label="Gastos diarios">{expenseItems.map(({id,label,Icon})=><button type="button" key={id} aria-current={active===id?'page':undefined} onClick={()=>{onChange(id);setExpenseGroup({section:id,expanded:true});setOpen(false);}}><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>}</div>:<button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => { onChange(id); setOpen(false); }}><span className="design-nav-icon" aria-hidden="true">{glyph}</span>{label}{id === 'coach' && <small>IA</small>}</button>)}
      <div className="notification-nav-group">
        <button type="button" aria-expanded={expanded} className={notificationActive?'notification-nav-active':undefined} onClick={()=>setGroup({section:active,expanded:!expanded})}><Bell size={19} aria-hidden="true"/>Notificaciones<ChevronDown size={16} aria-hidden="true" className={'notification-nav-chevron'+(expanded?' expanded':'')}/></button>
        {expanded&&<div className="notification-nav-children" role="group" aria-label="Notificaciones">
          {balanceSections.filter(section=>section.id==='notifications'||section.id==='reminders').map(({id,label})=><button type="button" key={id} aria-current={active===id?'page':undefined} onClick={()=>{onChange(id);setGroup({section:id,expanded:true});setOpen(false);}}>{id==='notifications'?<Inbox size={16} aria-hidden="true"/>:<Settings size={16} aria-hidden="true"/>}{label}</button>)}
        </div>}
      </div>
    </nav>
    <div className="balance-nav-footer">
      {user.role === 'admin' && <button onClick={() => { setOpen(false); onAdmin(); }}><Users size={18}/>Administrar usuarios</button>}
      <button onClick={onLogout}><LogOut size={18}/>Cerrar sesión</button>
      <div className="balance-profile"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Cuenta personal'}</small></div></div>
    </div>
  </>;
  return <><aside className="balance-sidebar">{navigation}</aside><header className="balance-topbar">
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className="balance-menu" aria-label="Abrir menú de navegación"><Menu size={22}/></button></SheetTrigger><SheetContent side="left" className="balance-mobile-nav"><SheetTitle className="sr-only">Menú de Mi Balance</SheetTitle><SheetDescription className="sr-only">Selecciona una sección de tus finanzas.</SheetDescription>{navigation}</SheetContent></Sheet>
    <span className="balance-breadcrumb">Mi Balance <span>/</span> {expenseActive?'Gastos diarios / '+expenseItems.find(item=>item.id===active)?.label:obligationActive?'Obligaciones / '+obligationItems.find(item=>item.id===active)?.label:balanceSections.find(section => section.id === active)?.label}</span><div className="balance-top-actions"><AmountPrivacyToggle/><NotificationBell key={user.id} userId={user.id} onChange={onChange} revision={notificationRevision}/><span className="balance-top-profile"><span className="balance-avatar" aria-hidden="true">{user.displayName.slice(0,1).toUpperCase()}</span><span>{user.displayName}</span></span></div>
  </header></>;
}
