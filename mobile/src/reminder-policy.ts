export type ScheduledReminder = { id: string; at: number; title: string; body: string; section: 'reminders' };
export function parseReminderMessage(raw: string, now = Date.now()) {
  if (raw.length > 64000) throw new Error('Mensaje demasiado grande');
  const value = JSON.parse(raw);
  if (!value || value.type !== 'mi-balance-reminders' || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) || !['clear','sync','enable','disable','test'].includes(value.action)) throw new Error('Solicitud no válida');
  if (value.action === 'clear') return { id: value.id as string, action: 'clear' as const, userId: '', plan: [] as ScheduledReminder[] };
  if (typeof value.userId !== 'string' || !/^[\w-]{1,100}$/.test(value.userId) || !Array.isArray(value.plan) || value.plan.length > 30) throw new Error('Calendario no válido');
  const seen = new Set<string>();
  const plan: ScheduledReminder[] = value.plan.map((p: ScheduledReminder) => {
    if (!p || typeof p.id !== 'string' || !/^balance-20\d{2}-\d{2}-\d{2}$/.test(p.id) || seen.has(p.id) || !Number.isFinite(p.at) || p.at < now - 60000 || p.at > now + 31 * 86400000 || p.section !== 'reminders' || p.title !== 'Mi Balance IA' || ![
      'Tienes pagos por revisar y promociones registradas para hoy.',
      'Tienes pagos por revisar. Consulta tus obligaciones.',
      'Tienes promociones registradas para hoy. Consulta tu calendario.',
    ].includes(p.body)) throw new Error('Calendario no válido');
    seen.add(p.id);
    return { id: p.id, at: p.at, title: p.title, body: p.body, section: 'reminders' };
  });
  return { id: value.id as string, action: value.action as 'sync'|'enable'|'disable'|'test', userId: value.userId as string, plan };
}
