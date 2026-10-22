'use client';

import { useState } from 'react';
import { AmountPrivacyToggle } from './amount-privacy';
import Link from 'next/link';
import { Users, LogOut, Menu, Wallet } from 'lucide-react';
import NotificationBell from './notification-bell';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

export const balanceSections = [
  { id: 'overview', label: 'Resumen', glyph: '⊞' },
  { id: 'obligations', label: 'Obligaciones', glyph: '↕' },
  { id: 'expenses', label: 'Gastos diarios', glyph: '◎' },
  { id: 'goals', label: 'Metas', glyph: '◇' },
  { id: 'coach', label: 'Asistente IA', glyph: '✦' },
  { id: 'promotions', label: 'Promociones', glyph: '📍' },
  { id: 'reminders', label: 'Notificaciones', glyph: '🔔' },
];

export default function BalanceNavigation({ active, onChange, user, onAdmin, onLogout, notificationRevision }: {
  notificationRevision: unknown;
  active: string; onChange: (section: string,target?:{id:string;month?:string}) => void;
  user: { id: string; displayName: string; role: 'admin' | 'user' }; onAdmin: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigation = <>
    <Link href="/" className="balance-brand"><span><Wallet size={21}/></span>Mi Balance <b>IA</b></Link>
    <p className="balance-nav-label">TU ESPACIO FINANCIERO</p>
    <nav aria-label="Navegación principal">{balanceSections.map(({ id, label, glyph }) => <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => { onChange(id); setOpen(false); }}><span className="design-nav-icon" aria-hidden="true">{glyph}</span>{label}{id === 'coach' && <small>IA</small>}</button>)}</nav>
    <div className="balance-nav-footer">
      {user.role === 'admin' && <button onClick={() => { setOpen(false); onAdmin(); }}><Users size={18}/>Administrar usuarios</button>}
      <button onClick={onLogout}><LogOut size={18}/>Cerrar sesión</button>
      <div className="balance-profile"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Cuenta personal'}</small></div></div>
    </div>
  </>;
  return <><aside className="balance-sidebar">{navigation}</aside><header className="balance-topbar">
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className="balance-menu" aria-label="Abrir menú de navegación"><Menu size={22}/></button></SheetTrigger><SheetContent side="left" className="balance-mobile-nav"><SheetTitle className="sr-only">Menú de Mi Balance</SheetTitle><SheetDescription className="sr-only">Selecciona una sección de tus finanzas.</SheetDescription>{navigation}</SheetContent></Sheet>
    <span className="balance-breadcrumb">Mi Balance <span>/</span> {balanceSections.find(section => section.id === active)?.label}</span><div className="balance-top-actions"><AmountPrivacyToggle/><NotificationBell key={user.id} userId={user.id} onChange={onChange} revision={notificationRevision}/><span className="balance-top-profile"><span className="balance-avatar" aria-hidden="true">{user.displayName.slice(0,1).toUpperCase()}</span><span>{user.displayName}</span></span></div>
  </header></>;
}
