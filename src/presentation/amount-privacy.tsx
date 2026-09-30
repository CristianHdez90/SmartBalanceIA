'use client';

import { useSyncExternalStore } from 'react';
import { Eye, EyeOff, Minimize2 } from 'lucide-react';
import { money } from '../domain/finance';

const key = 'mi-balance-hide-amounts';
const compactKey = 'mi-balance-compact-amounts';
const event = 'mi-balance-amount-privacy';
let fallback = false;
let compactFallback = false;
function compactSnapshot() {
  try { return localStorage.getItem(compactKey) === 'true'; } catch { return compactFallback; }
}
const compactFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1 });
function snapshot() {
  try { return localStorage.getItem(key) === 'true'; } catch { return fallback; }
}
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(event, listener); window.removeEventListener('storage', listener); };
}
export function usePrivateMoney() {
  const hidden = useSyncExternalStore(subscribe, snapshot, () => true);
  const compact = useSyncExternalStore(subscribe, compactSnapshot, () => false);
  return Object.assign((amount: number) => hidden ? '$ ••••••' : compact ? compactFormatter.format(amount) : money(amount), { hidden, compact });
}
export function AmountPrivacyToggle() {
  const { hidden, compact } = usePrivateMoney();
  const label = hidden ? 'Mostrar valores monetarios' : 'Ocultar valores monetarios';
  const compactLabel = compact ? 'Mostrar valores completos' : 'Abreviar valores monetarios';
  return <><button type="button" className="balance-notifications" aria-label={label} title={label} aria-pressed={hidden} onClick={() => {
    fallback = !hidden;
    try { localStorage.setItem(key, String(!hidden)); } catch { /* Keep the preference for this session when storage is unavailable. */ }
    window.dispatchEvent(new Event(event));
  }}>{hidden ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}</button><button type="button" className="balance-notifications" aria-label={compactLabel} title={`${compactLabel} (ej. $ 1,2 M). El ojo mantiene los valores ocultos.`} aria-pressed={compact} style={compact ? { color: '#a5b4fc', background: '#25234d', boxShadow: 'inset 0 0 0 1px #6366f1' } : undefined} onClick={() => {
    compactFallback = !compact;
    try { localStorage.setItem(compactKey, String(!compact)); } catch { /* Preserve session preference without storage. */ }
    window.dispatchEvent(new Event(event));
  }}><Minimize2 size={20} aria-hidden="true"/></button></>;
}
