'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Plus, Pencil, Archive, RotateCcw, Sparkles, LoaderCircle, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { goalIcons, goalColors, goalProgress, type FinancialGoal } from '@/src/domain/goals';
import { money } from '@/src/domain/finance';

type Editor = { id: string; goal?: FinancialGoal; contribution?: boolean };
const iconLabels = { travel: 'Viaje', emergency: 'Emergencia', car: 'Vehículo', home: 'Vivienda', education: 'Educación', savings: 'Ahorro' };
const colorLabels = { indigo: 'Índigo', cyan: 'Cian', orange: 'Naranja', green: 'Verde' };
async function requestGoals(body?: unknown, signal?: AbortSignal): Promise<FinancialGoal[]> {
  const response = await fetch('/api/goals', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { signal, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'No se pudieron cargar tus metas.');
  return result.goals;
}
export default function FinancialGoals({ onCoach }: { onCoach: () => void }) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [formError, setFormError] = useState(''), [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null), [archived, setArchived] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestGoals(undefined, controller.signal).then(setGoals).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function reload() {
    setLoading(true); setError(''); setNotice('');
    try { setGoals(await requestGoals()); } catch (error) { setError((error as Error).message); } finally { setLoading(false); }
  }
  function open(goal?: FinancialGoal, contribution = false) { setEditor({ id: goal?.id ?? crypto.randomUUID(), goal, contribution }); setFormError(''); setNotice(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || saving) return;
    const values = new FormData(event.currentTarget), current = editor.goal;
    const fields = editor.contribution && current ? { name: current.name, target: current.target, saved: current.saved + Number(values.get('contribution')), dueDate: current.dueDate, icon: current.icon, color: current.color } : {
      name: values.get('name'), target: Number(values.get('target')), saved: Number(values.get('saved')), dueDate: values.get('dueDate'), icon: values.get('icon'), color: values.get('color'),
    };
    setSaving(true); setFormError('');
    try {
      setGoals(await requestGoals({ ...fields, id: editor.id, action: current ? 'update' : 'create', ...(current ? { version: current.version } : {}) }));
      setEditor(null); setNotice(editor.contribution ? 'Ahorro actualizado.' : 'Meta guardada.');
    } catch (error) { setFormError((error as Error).message); } finally { setSaving(false); }
  }
  async function archive(goal: FinancialGoal) {
    if (saving) return; setSaving(true); setError(''); setNotice('');
    try { setGoals(await requestGoals({ action: 'archive', id: goal.id, version: goal.version, archived: !goal.archived })); setNotice(goal.archived ? 'Meta restaurada.' : 'Meta archivada. Puedes recuperarla en Archivadas.'); }
    catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }
  const visible = goals.filter(goal => Boolean(goal.archived) === archived);
  return <div className="financial-goals">
    <div className="page-heading"><div><h1>Metas financieras</h1><p className="muted">Tus objetivos de ahorro e inversión.</p></div><button className="primary" disabled={loading || saving || !!error} onClick={() => open()}><Plus size={18}/>Nueva meta</button></div>
    <div className="goals-toolbar"><div role="group" aria-label="Mostrar metas"><button aria-pressed={!archived} onClick={() => setArchived(false)}>Activas</button><button aria-pressed={archived} onClick={() => setArchived(true)}>Archivadas</button></div><button className="text-button" disabled={loading || saving} onClick={() => void reload()}><RefreshCw size={15}/>Actualizar</button></div>
    {error && <p className="error" role="alert">{error}<button className="secondary" disabled={loading || saving} onClick={() => void reload()}>Reintentar</button></p>}
    {notice && <p className="goals-notice" role="status">{notice}</p>}
    {loading ? <div className="empty" role="status"><LoaderCircle className="spin"/>Cargando tus metas…</div> : <>
      <div className="goals-grid">{visible.map(goal => {
        const progress = goalProgress(goal);
        return <article className="goal-card" key={goal.id} style={{ '--goal-color': goalColors[goal.color] } as CSSProperties}>
          <div className="goal-card-top"><span className="goal-emoji" role="img" aria-label={iconLabels[goal.icon]}>{goalIcons[goal.icon]}</span><time dateTime={goal.dueDate} title={goal.dueDate.split('-').reverse().join('/')}>{new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(new Date(`${goal.dueDate}T12:00:00`))}</time></div>
          <h2>{goal.name}</h2><p>{money(goal.saved)} de {money(goal.target)}</p>
          <div className="goal-progress" role="progressbar" aria-label={`Progreso de ${goal.name}`} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${money(goal.saved)} ahorrados de ${money(goal.target)}`}><span style={{ width: `${progress.percent}%` }}/></div>
          <div className="goal-progress-caption"><span>{progress.percent}% completado</span><strong>{progress.complete ? '¡Meta alcanzada!' : `${money(progress.remaining)} restante`}</strong></div>
          <div className="goal-actions">{!goal.archived && <><button disabled={saving} className="goal-contribute" onClick={() => open(goal, true)}><Plus size={15}/>Registrar ahorro</button><button disabled={saving} aria-label={`Editar ${goal.name}`} onClick={() => open(goal)}><Pencil size={16}/></button></>}<button disabled={saving} aria-label={`${goal.archived ? 'Restaurar' : 'Archivar'} ${goal.name}`} onClick={() => void archive(goal)}>{goal.archived ? <RotateCcw size={16}/> : <Archive size={16}/>}</button></div>
        </article>;
      })}</div>
      {!visible.length && !error && <div className="goal-empty"><span role="img" aria-label="Objetivo">🎯</span><h2>{archived ? 'No tienes metas archivadas' : 'Dale un destino a tus ahorros'}</h2><p>{archived ? 'Las metas que archives aparecerán aquí y podrás restaurarlas.' : 'Crea tu primera meta, define el monto y elige cuándo quieres alcanzarla.'}</p>{!archived && <button className="primary" onClick={() => open()}><Plus size={17}/>Crear mi primera meta</button>}</div>}
      <section className="goal-advisor"><h2><Sparkles size={19}/>Planifica con tu asistente IA</h2><p>Explora cómo organizar tu presupuesto para avanzar hacia tus objetivos. Puedes incluir el nombre, el monto pendiente y la fecha de tu meta en tu consulta.</p><button className="text-button" onClick={onCoach}>Crear un plan con el asistente →</button></section>
      <p className="goals-help">Tus metas se guardan en tu cuenta y se conservan entre meses. Registrar ahorro aquí solo actualiza su progreso; no modifica los ingresos, gastos ni el disponible mensual.</p>
    </>}
    <Dialog open={!!editor} onOpenChange={value => { if (!value && !saving) setEditor(null); }}><DialogContent className="editor goal-editor"><DialogTitle>{editor?.contribution ? 'Registrar ahorro' : editor?.goal ? 'Editar meta' : 'Nueva meta'}</DialogTitle><DialogDescription>{editor?.contribution ? `Añade al progreso de «${editor.goal?.name}» el dinero que ya hayas ahorrado.` : 'Define tu objetivo, lo que ya tienes ahorrado y una fecha para alcanzarlo.'}</DialogDescription>
      {editor && <form key={`${editor.id}-${editor.contribution}`} onSubmit={save}>
        {editor.contribution ? <><p className="muted">Ahorro actual: {money(editor.goal?.saved ?? 0)}</p><label>Ahorro adicional (COP)<input autoFocus name="contribution" type="number" required min="1" max={999999999999 - (editor.goal?.saved ?? 0)} step="1" placeholder="Ej. 100000"/></label></> : <>
          <label>Nombre de la meta<input autoFocus name="name" required minLength={2} maxLength={100} placeholder="Ej. Viaje a Europa" defaultValue={editor.goal?.name}/></label>
          <div className="goal-form-row"><label>Monto objetivo (COP)<input name="target" type="number" required min="1" max="999999999999" step="1" defaultValue={editor.goal?.target}/></label><label>Ya ahorrado (COP)<input name="saved" type="number" required min="0" max="999999999999" step="1" defaultValue={editor.goal?.saved ?? 0}/></label></div>
          <label>Fecha objetivo<input name="dueDate" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={editor.goal?.dueDate}/></label>
          <div className="goal-form-row"><label>Icono<select name="icon" defaultValue={editor.goal?.icon ?? 'travel'}>{Object.entries(goalIcons).map(([key, icon]) => <option key={key} value={key}>{icon} {iconLabels[key as keyof typeof goalIcons]}</option>)}</select></label><label>Color<select name="color" defaultValue={editor.goal?.color ?? 'indigo'}>{Object.entries(colorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        </>}
        {formError && <div role="alert" className="auth-error">{formError}<button type="button" className="text-button" disabled={saving} onClick={() => { setEditor(null); void reload(); }}>Cerrar y recargar metas</button></div>}
        <div className="form-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setEditor(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando…' : editor.contribution ? 'Guardar ahorro' : 'Guardar meta'}</button></div>
      </form>}
    </DialogContent></Dialog>
  </div>;
}
