'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, Pencil, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, bogotaDay, type DeviceReminder, type PromotionReminder, type ReminderSettings } from '../domain/reminders';
import { supportsDeviceReminders, syncDeviceReminders } from './device-reminders';
import './reminder-center.css';

type Data = { settings: ReminderSettings; promotions: PromotionReminder[]; plan: DeviceReminder[]; until: string };
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const newPromotion = (): PromotionReminder => ({ id: crypto.randomUUID(), supermarket: '', product: '', weekdays: [], startDate: bogotaDay(), endDate: addDays(bogotaDay(), 90), note: '', enabled: true, version: 0 });

export default function ReminderCenter({ userId, visible, revision }: { userId: string; visible: boolean; revision: unknown }) {
  const [data, setData] = useState<Data | null>(null), [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [editor, setEditor] = useState<PromotionReminder | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [device, setDevice] = useState('Verificando compatibilidad…'), [native, setNative] = useState(false), [enabled, setEnabled] = useState(false);
  const alive = useRef(true), generation = useRef(0);
  const sync = useCallback(async (value: Data, action: 'sync' | 'enable' | 'disable' | 'test' = 'sync') => {
    const supported = supportsDeviceReminders(); setNative(supported);
    if (!supported) { setDevice('Puedes administrar tus recordatorios aquí. Para recibirlos instala el APK actualizado de Mi Balance IA.'); return; }
    try {
      const result = await syncDeviceReminders(userId, value.plan, action);
      if (!alive.current) return;
      setEnabled(result.enabled);
      setDevice(result.enabled ? `Sincronizado: ${result.count} avisos diarios hasta el ${value.until}.` : 'Los avisos están desactivados en este dispositivo.');
    } catch (e) { if (alive.current) setDevice((e as Error).message); }
  }, [userId]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const r = await fetch('/api/reminders', { cache: 'no-store' }), value = await r.json();
      if (!r.ok) throw new Error(value.error);
      if (!alive.current || current !== generation.current) return;
      setData(value); setSettings(previous => previous ?? value.settings); setError(''); await sync(value);
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
  async function save(payload: unknown) {
    setBusy(true); setError(''); ++generation.current;
    try {
      const r = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setData(value); setSettings(value.settings); setEditor(null); toast.success('Recordatorios guardados'); await sync(value);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function deviceAction(action: 'enable' | 'disable' | 'test') { if (!data) return; setBusy(true); try { await sync(data, action); } finally { setBusy(false); } }
  return <section className="reminder-center" hidden={!visible} aria-label="Notificaciones y calendario de promociones">
    <header><div><h1><Bell/> Notificaciones</h1><p>Pagos por revisar y tus días de promoción, en un solo calendario.</p></div><button className="primary" onClick={() => setEditor(newPromotion())}><Plus size={18}/> Registrar promoción</button></header>
    {error && <p role="alert" className="auth-error">{error} <button onClick={() => void load()}>Actualizar</button></p>}
    <div className="reminder-cards"><article><h2><Bell size={20}/> Este dispositivo</h2><p role="status">{device}</p><div className="reminder-actions"><button className="primary" disabled={busy || !data || !native} onClick={() => void deviceAction(enabled ? 'disable' : 'enable')}>{enabled ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}</button>{enabled && <button className="secondary" disabled={busy} onClick={() => void deviceAction('test')}>Probar aviso</button>}<button className="secondary" disabled={busy} onClick={() => void load()}>Sincronizar</button></div><small>Los avisos no muestran montos ni nombres de obligaciones. Abre la app para consultar los detalles.</small></article>
    <article><h2><CalendarDays size={20}/> Preferencias</h2>{settings ? <form onSubmit={e => { e.preventDefault(); void save({ action: 'settings', settings }); }}>
      <label className="reminder-check"><input type="checkbox" checked={settings.payments} onChange={e => setSettings({ ...settings, payments: e.target.checked })}/> Pagos por revisar</label>
      <label>Avisar antes del vencimiento (días)<input type="number" min="0" max="14" required value={settings.advanceDays} onChange={e => setSettings({ ...settings, advanceDays: Number(e.target.value) })}/></label>
      <small>También el día del vencimiento y cada día posterior mientras siga pendiente. No incluye obligaciones sin valor o sin fecha.</small>
      <label className="reminder-check"><input type="checkbox" checked={settings.promotions} onChange={e => setSettings({ ...settings, promotions: e.target.checked })}/> Promociones del día</label>
      <label>Hora de los avisos (Colombia)<input type="time" required value={settings.time} onChange={e => setSettings({ ...settings, time: e.target.value })}/></label>
      <button className="primary" disabled={busy}>Guardar preferencias</button>
    </form> : <p>Cargando preferencias…</p>}</article></div>
    <p className="reminder-explanation">Se programa un resumen diario para los próximos 30 días según las obligaciones existentes y las promociones vigentes. Abre la app para renovar el calendario y actualizar pagos hechos desde otros dispositivos. Al cerrar sesión se cancelan los avisos de este teléfono. El sistema operativo puede retrasarlos por ahorro de batería.</p>
    {editor && <article className="reminder-editor"><h2>{editor.version ? 'Editar promoción' : 'Registrar promoción'}</h2><form onSubmit={e => { e.preventDefault(); if (!editor.weekdays.length) { setError('Selecciona al menos un día de promoción.'); return; } void save({ action: 'save', ...editor }); }}>
      <div className="reminder-form-grid"><label>Supermercado<input required minLength={2} maxLength={80} list="supermarket-options" value={editor.supermarket} onChange={e => setEditor({ ...editor, supermarket: e.target.value })}/><datalist id="supermarket-options"><option>Supermu</option><option>Éxito</option><option>Olímpica</option></datalist></label><label>Producto o categoría<input required minLength={2} maxLength={120} placeholder="Ej. frutas y verduras" value={editor.product} onChange={e => setEditor({ ...editor, product: e.target.value })}/></label>
      <label>Desde<input type="date" required value={editor.startDate} onChange={e => setEditor({ ...editor, startDate: e.target.value })}/></label><label>Hasta<input type="date" required min={editor.startDate} value={editor.endDate} onChange={e => setEditor({ ...editor, endDate: e.target.value })}/></label></div>
      <fieldset><legend>Días de promoción (cada semana durante la vigencia)</legend><div className="reminder-days">{days.map((day, index) => <label key={day}><input type="checkbox" checked={editor.weekdays.includes(index)} onChange={e => setEditor({ ...editor, weekdays: e.target.checked ? [...editor.weekdays, index].sort() : editor.weekdays.filter(d => d !== index) })}/>{day}</label>)}</div></fieldset>
      <label>Condiciones o sucursal<textarea maxLength={300} value={editor.note} onChange={e => setEditor({ ...editor, note: e.target.value })}/></label><label className="reminder-check"><input type="checkbox" checked={editor.enabled} onChange={e => setEditor({ ...editor, enabled: e.target.checked })}/> Promoción activa</label><div className="reminder-actions"><button className="primary" disabled={busy}>Guardar promoción</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button></div>
    </form></article>}
    <h2><ShoppingBasket size={22}/> Mis supermercados y promociones</h2><p>Registra los días que hayas confirmado con cada comercio. Estos registros son tuyos; no son ofertas verificadas automáticamente.</p>
    <div className="reminder-promotion-grid">{data?.promotions.map(p => <article key={p.id}><h3>🛒 {p.supermarket}</h3><strong>{p.product}</strong><p>{p.weekdays.map(d => days[d]).join(', ')} · {data.settings.time}</p><small>{p.startDate} a {p.endDate} · {!p.enabled ? 'Pausada' : p.endDate < bogotaDay() ? 'Vencida' : 'Activa'}</small>{p.note && <p>{p.note}</p>}<div className="reminder-actions"><button className="secondary" disabled={busy} onClick={() => setEditor(p)}><Pencil size={16}/> Editar</button><button className="secondary" disabled={busy} onClick={() => void save({ action: 'save', ...p, enabled: !p.enabled })}>{p.enabled ? 'Pausar' : 'Activar'}</button><button className="secondary" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar el recordatorio de ${p.product} en ${p.supermarket}?`)) void save({ action: 'delete', id: p.id, version: p.version }); }}><Trash2 size={16}/> Eliminar</button></div></article>)}</div>
    {data && !data.promotions.length && <p className="reminder-empty">Aún no tienes promociones registradas. Añade tu primer supermercado y sus días de oferta.</p>}
  </section>;
}
