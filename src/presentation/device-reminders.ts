'use client';
import type { DeviceReminder } from '../domain/reminders';

type NativeWindow = Window & { miBalanceReminders?: number; ReactNativeWebView?: { postMessage: (value: string) => void } };
export function supportsDeviceReminders() { return typeof window !== 'undefined' && (window as NativeWindow).miBalanceReminders === 1; }
export function clearDeviceReminders() {
  (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'mi-balance-reminders', action: 'clear', id: crypto.randomUUID() }));
}
export function syncDeviceReminders(userId: string, plan: DeviceReminder[], action: 'sync' | 'enable' | 'disable' | 'test' = 'sync') {
  return new Promise<{ enabled: boolean; count: number }>((resolve, reject) => {
    if (!supportsDeviceReminders()) { reject(new Error('Instala la nueva versión de la app para activar avisos en este dispositivo.')); return; }
    const id = crypto.randomUUID();
    const result = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data?.id !== id) return;
      clearTimeout(timer); window.removeEventListener('mi-balance-reminders-result', result);
      if (data.error) reject(new Error(data.error)); else resolve({ enabled: !!data.enabled, count: Number(data.count || 0) });
    };
    const timer = setTimeout(() => { window.removeEventListener('mi-balance-reminders-result', result); reject(new Error('El dispositivo no confirmó los avisos. Vuelve a sincronizar.')); }, 45000);
    window.addEventListener('mi-balance-reminders-result', result);
    (window as NativeWindow).ReactNativeWebView!.postMessage(JSON.stringify({ type: 'mi-balance-reminders', id, action, userId, plan }));
  });
}
