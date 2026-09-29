'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Landmark, ReceiptText, ArrowLeftRight, ClipboardCheck, Sparkles, MapPin, Users, LogOut, Menu, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

export const balanceSections = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'obligations', label: 'Obligaciones', icon: Landmark },
  { id: 'expenses', label: 'Gastos diarios', icon: ReceiptText },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
  { id: 'report', label: 'Reporte de pagos', icon: ClipboardCheck },
  { id: 'coach', label: 'Asistente IA', icon: Sparkles },
  { id: 'promotions', label: 'Promociones', icon: MapPin },
];

export default function BalanceNavigation({ active, onChange, user, onAdmin, onLogout }: {
  active: string; onChange: (section: string) => void;
  user: { displayName: string; role: 'admin' | 'user' }; onAdmin: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigation = <>
    <Link href="/" className="balance-brand"><span><Wallet size={21}/></span>Mi Balance <b>IA</b></Link>
    <p className="balance-nav-label">TU ESPACIO FINANCIERO</p>
    <nav aria-label="Navegación principal">{balanceSections.map(({ id, label, icon: Icon }) => <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => { onChange(id); setOpen(false); }}><Icon size={19}/>{label}{id === 'coach' && <small>IA</small>}</button>)}</nav>
    <div className="balance-nav-footer">
      {user.role === 'admin' && <button onClick={() => { setOpen(false); onAdmin(); }}><Users size={18}/>Administrar usuarios</button>}
      <button onClick={onLogout}><LogOut size={18}/>Cerrar sesión</button>
      <div className="balance-profile"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Cuenta personal'}</small></div></div>
    </div>
  </>;
  return <><aside className="balance-sidebar">{navigation}</aside><header className="balance-topbar">
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className="balance-menu" aria-label="Abrir menú de navegación"><Menu size={22}/></button></SheetTrigger><SheetContent side="left" className="balance-mobile-nav"><SheetTitle className="sr-only">Menú de Mi Balance</SheetTitle><SheetDescription className="sr-only">Selecciona una sección de tus finanzas.</SheetDescription>{navigation}</SheetContent></Sheet>
    <span className="balance-breadcrumb">Mi Balance <span>/</span> {balanceSections.find(section => section.id === active)?.label}</span><span className="balance-top-profile">{user.displayName}</span>
  </header></>;
}
