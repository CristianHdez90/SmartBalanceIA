'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Pencil, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, bogotaDay, type DeviceReminder, type PromotionReminder, type ReminderSettings } from '../domain/reminders';
import { supportsDeviceReminders, syncDeviceReminders } from './device-reminders';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import WebPushCard from './web-push-card';
import AuxiliaryInterval from './auxiliary-interval';
import './reminder-center.css';

type Data = { settings: ReminderSettings; promotions: PromotionReminder[]; plan: DeviceReminder[]; until: string };
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const newPromotion = (): PromotionReminder => ({ id: crypto.randomUUID(), supermarket: '', website:'', city:'', address:'', phone:'', product: '', weekdays: [], startDate: bogotaDay(), endDate: addDays(bogotaDay(), 90), note: '', enabled: true, version: 0 });

export default function ReminderCenter({ userId, visible, revision, focusPromotion }: { userId: string; visible: boolean; revision: unknown; focusPromotion?:{id:string}|null }) {
  const [data, setData] = useState<Data | null>(null), [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [editor, setEditor] = useState<PromotionReminder | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [device, setDevice] = useState('Verificando compatibilidad…'), [native, setNative] = useState(false), [enabled, setEnabled] = useState(false);
  const alive = useRef(true), generation = useRef(0);
  const lastSettings = useRef<ReminderSettings | null>(null);
  const sync = useCallback(async (value: Data, action: 'sync' | 'enable' | 'disable' | 'test' = 'sync') => {
    const supported = supportsDeviceReminders(); setNative(supported);
    if (!supported) return;
    try {
      const result = await syncDeviceReminders(userId, value.plan, action);
      if (!alive.current) return;
      setEnabled(result.enabled);
      setDevice(result.enabled ? `Sincronizado: ${result.count} avisos diarios hasta el ${value.until}.` : 'Los avisos están desactivados en este dispositivo.');
    } catch (e) { if (alive.current) setDevice((e as Error).message); }
  }, [userId]);
  const load = useCallback(async (manual = false) => {
    const current = ++generation.current;
    try {
      const r = await fetch('/api/reminders', { cache: 'no-store' }), value = await r.json();
      if (!r.ok) throw new Error(value.error);
      if (!alive.current || current !== generation.current) return;
      const previousSaved = lastSettings.current;
      setData(value); setSettings(previous => !previous || JSON.stringify(previous) === JSON.stringify(previousSaved) ? value.settings : previous);
      lastSettings.current = value.settings; setError(''); await sync(value);
      if (manual && alive.current && current === generation.current && !supportsDeviceReminders()) toast.success('Datos actualizados. El próximo envío web utilizará los registros guardados.');
    } catch (e) { if (alive.current && current === generation.current) setError((e as Error).message); }
  }, [sync]);
  useEffect(() => {
    alive.current = true;
    const refresh = () => { if (!document.hidden) void load(); };
    window.addEventListener('focus', refresh); window.addEventListener('mi-balance-reminders-ready', refresh); document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 5 * 60000);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('mi-balance-reminders-ready', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => { const timer = setTimeout(() => void load(), 400); return () => clearTimeout(timer); }, [load, revision]);
  useEffect(()=>{
    if(!visible||!focusPromotion||!data)return;
    const timer=setTimeout(()=>{const card=document.getElementById('promotion-'+focusPromotion.id);card?.scrollIntoView({block:'center',behavior:'smooth'});card?.focus({preventScroll:true});},150);
    return()=>clearTimeout(timer);
  },[visible,focusPromotion,data]);
  async function save(payload: unknown) {
    setBusy(true); setError(''); ++generation.current;
    try {
      const r = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setData(value); setSettings(value.settings); lastSettings.current = value.settings; setEditor(null); toast.success('Recordatorios guardados'); window.dispatchEvent(new Event('balance-reminders-changed')); await sync(value);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function deviceAction(action: 'enable' | 'disable' | 'test') { if (!data) return; setBusy(true); try { await sync(data, action); } finally { setBusy(false); } }
  async function refreshManually() { setBusy(true); try { await load(true); } finally { setBusy(false); } }
  return <section className="reminder-center" hidden={!visible} aria-label="Notificaciones y calendario de promociones">
    <header><div><h1><Bell/> Notificaciones</h1><p>Pagos por revisar y tus días de promoción, en un solo calendario.</p></div><button className="primary" onClick={() => setEditor(newPromotion())}><Plus size={18}/> Registrar promoción</button></header>
    {error && !editor && <p role="alert" className="auth-error">{error} <button onClick={() => void load()}>Actualizar</button></p>}
    <div className="reminder-cards">{!native ? <WebPushCard key={userId}/> : <article><h2><Bell size={20}/> {native ? 'Este dispositivo' : 'Recordatorios desde la web'}</h2><p role="status">{device}</p><div className="reminder-actions">{native && <button className="primary" disabled={busy || !data} onClick={() => void deviceAction(enabled ? 'disable' : 'enable')}>{enabled ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}</button>}{native && enabled && <button className="secondary" disabled={busy} onClick={() => void deviceAction('test')}>Probar aviso</button>}<button className="secondary" disabled={busy} onClick={() => void refreshManually()}>{busy ? 'Procesando…' : native ? 'Sincronizar avisos' : 'Actualizar datos'}</button></div><small>Los avisos no muestran montos ni nombres de obligaciones. Abre la app para consultar los detalles.</small></article>}
    <article><h2><CalendarDays size={20}/> Preferencias</h2>{settings ? <form onSubmit={e => { e.preventDefault(); void save({ action: 'settings', settings }); }}>
      <label className="reminder-check"><input type="checkbox" checked={settings.payments} onChange={e => setSettings({ ...settings, payments: e.target.checked })}/> Pagos por revisar</label>
      <label>Avisar antes del vencimiento (días)<input type="number" min="0" max="14" required value={settings.advanceDays} onChange={e => setSettings({ ...settings, advanceDays: Number(e.target.value) })}/></label>
      <small>Cada día desde la anticipación indicada hasta completar el pago, incluso después del vencimiento. No incluye obligaciones sin valor o sin fecha.</small>
      <label className="reminder-check"><input type="checkbox" checked={settings.promotions} onChange={e => setSettings({ ...settings, promotions: e.target.checked })}/> Promociones del día</label>
      <label>Hora de los avisos (Colombia)<input type="time" required value={settings.time} onChange={e => setSettings({ ...settings, time: e.target.value })}/></label>
      <AuxiliaryInterval key={userId} userId={userId}/>
      <small>El servidor enviará el resumen a partir de esta hora. GitHub Actions revisa los avisos periódicamente; puede haber retrasos.</small><div className="reminder-actions"><button className="primary" disabled={busy}>Guardar preferencias</button><button type="button" className="secondary" disabled={busy} onClick={() => void refreshManually()}>Actualizar datos</button></div>
    </form> : <p>Cargando preferencias…</p>}</article></div>
    <p className="reminder-explanation">{native ? <>Se programa un resumen diario para los próximos 30 días según las obligaciones existentes y las promociones vigentes. Abre la app para renovar el calendario y actualizar pagos hechos desde otros dispositivos. Al cerrar sesión se cancelan los avisos de este teléfono. El sistema operativo puede retrasarlos por ahorro de batería.</> : <>Los avisos web se calculan en el servidor con los pagos y promociones guardados, sin tener que abrir la página. Actívalos en cada navegador donde quieras recibirlos. En iPhone añade esta web a la pantalla de inicio antes de activarlos.</>}</p>
    <Dialog open={!!editor && visible} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent className="editor reminder-center reminder-modal" showCloseButton={!busy}><DialogTitle>{editor?.version ? 'Editar promoción' : 'Registrar promoción'}</DialogTitle><DialogDescription>Registra el supermercado, los productos y sus días de promoción.</DialogDescription>{editor && <><p className="auth-error" role="alert">{error}</p><form onSubmit={e => { e.preventDefault(); if (!editor.weekdays.length) { setError('Selecciona al menos un día de promoción.'); return; } void save({ action: 'save', ...editor }); }}>
      <div className="reminder-form-grid"><label>Supermercado<input required minLength={2} maxLength={80} list="supermarket-options" value={editor.supermarket} onChange={e => setEditor({ ...editor, supermarket: e.target.value })}/><datalist id="supermarket-options"><option>Supermu</option><option>Éxito</option><option>Olímpica</option></datalist></label><label>Producto o categoría<input required minLength={2} maxLength={120} placeholder="Ej. frutas y verduras" value={editor.product} onChange={e => setEditor({ ...editor, product: e.target.value })}/></label>
      <label>Página web<input type="url" maxLength={500} placeholder="https://www.supermercado.com" value={editor.website} onChange={e=>setEditor({...editor,website:e.target.value})}/></label>
      <label>Ciudad<input maxLength={100} value={editor.city} onChange={e=>setEditor({...editor,city:e.target.value})}/></label>
      <label>Dirección de la sucursal<input maxLength={250} value={editor.address} onChange={e=>setEditor({...editor,address:e.target.value})}/></label>
      <label>Teléfono<input type="tel" maxLength={60} value={editor.phone} onChange={e=>setEditor({...editor,phone:e.target.value})}/></label>
      <label>Desde<input type="date" required value={editor.startDate} onChange={e => setEditor({ ...editor, startDate: e.target.value })}/></label><label>Hasta<input type="date" required min={editor.startDate} value={editor.endDate} onChange={e => setEditor({ ...editor, endDate: e.target.value })}/></label></div>
      <fieldset><legend>Días de promoción (cada semana durante la vigencia)</legend><div className="reminder-days">{days.map((day, index) => <label key={day}><input type="checkbox" checked={editor.weekdays.includes(index)} onChange={e => setEditor({ ...editor, weekdays: e.target.checked ? [...editor.weekdays, index].sort() : editor.weekdays.filter(d => d !== index) })}/>{day}</label>)}</div></fieldset>
      <label>Condiciones o sucursal<textarea maxLength={300} value={editor.note} onChange={e => setEditor({ ...editor, note: e.target.value })}/></label><label className="reminder-check"><input type="checkbox" checked={editor.enabled} onChange={e => setEditor({ ...editor, enabled: e.target.checked })}/> Promoción activa</label><div className="reminder-actions"><button className="primary" disabled={busy}>Guardar promoción</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button></div>
    </form></>}</DialogContent></Dialog>
    <h2><ShoppingBasket size={22}/> Mis supermercados y promociones</h2><p>Registra los días que hayas confirmado con cada comercio. Estos registros son tuyos; no son ofertas verificadas automáticamente.</p>
    {data&&focusPromotion&&!data.promotions.some(p=>p.id===focusPromotion.id)&&<p role="status">Esta promoción ya no está registrada. Puedes consultar los detalles del aviso en la campana.</p>}
    <div className="reminder-promotion-grid">{data?.promotions.map(p => <article key={p.id} id={'promotion-'+p.id} tabIndex={-1} className={focusPromotion?.id===p.id?'reminder-promotion-focused':undefined}><h3>🛒 {p.supermarket}</h3><strong>{p.product}</strong><p>{p.weekdays.map(d => days[d]).join(', ')} · {data.settings.time}</p><small>{p.startDate} a {p.endDate} · {!p.enabled ? 'Pausada' : p.endDate < bogotaDay() ? 'Vencida' : 'Activa'}</small>{p.note && <p>{p.note}</p>}{p.city&&<p>Ciudad: {p.city}</p>}{p.address&&<p>Dirección: {p.address}</p>}{p.phone&&<p>Teléfono: <a href={'tel:'+p.phone.replace(/[^+0-9]/g,'')}>{p.phone}</a></p>}<div className="reminder-actions">{p.website&&<a href={p.website} target="_blank" rel="noopener noreferrer">Página web ↗</a>}{p.address&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p.supermarket,p.address,p.city].filter(Boolean).join(', '))} target="_blank" rel="noopener noreferrer">Ver dirección ↗</a>}<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.supermarket+' '+(p.city||'cerca de mí'))} target="_blank" rel="noopener noreferrer">Buscar sucursales cercanas ↗</a></div><div className="reminder-actions"><button className="secondary" disabled={busy} onClick={() => setEditor(p)}><Pencil size={16}/> Editar</button><button className="secondary" disabled={busy} onClick={() => void save({ action: 'save', ...p, enabled: !p.enabled })}>{p.enabled ? 'Pausar' : 'Activar'}</button><button className="secondary" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar el recordatorio de ${p.product} en ${p.supermarket}?`)) void save({ action: 'delete', id: p.id, version: p.version }); }}><Trash2 size={16}/> Eliminar</button></div></article>)}</div>
    {data && !data.promotions.length && <p className="reminder-empty">Aún no tienes promociones registradas. Añade tu primer supermercado y sus días de oferta.</p>}
  </section>;
}
