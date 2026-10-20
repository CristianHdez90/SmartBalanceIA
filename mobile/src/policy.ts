export const APP_URL = 'https://smart-balance-ia.vercel.app/';
export function isAppUrl(value: string) {
  try { return new URL(value).origin === new URL(APP_URL).origin; } catch { return false; }
}
export function isExternalUrl(value: string) {
  try { const u = new URL(value); return ['https:', 'mailto:', 'tel:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function parseExport(raw: string) {
  if (raw.length > 12_000_000) throw new Error('El archivo es demasiado grande para compartirlo.');
  const value = JSON.parse(raw);
  if (value.type !== 'mi-balance-export' || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id) || typeof value.filename !== 'string' || !/^mi-balance-[a-zA-Z0-9-]+\.(sql|csv|xlsx)$/.test(value.filename) || typeof value.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) || value.base64.length % 4 !== 0) throw new Error('Archivo de respaldo no válido.');
  const extension = value.filename.split('.').pop();
  return { id: value.id as string, filename: value.filename as string, base64: value.base64 as string, mimeType: extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : extension === 'csv' ? 'text/csv' : 'application/sql' };
}
