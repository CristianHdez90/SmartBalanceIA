import { z } from 'zod';

// Only browser push providers may receive server requests (prevents arbitrary URL/SSRF).
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value), host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      (host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
       host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
       host.endsWith('.notify.windows.com'));
  } catch { return false; }
}
const endpoint = z.string().max(4096).refine(isPushEndpoint, 'Proveedor push no compatible');
export const webPushCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), subscription: z.object({
    endpoint, expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,1}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) }).strict(),
  }).strict() }).strict(),
  z.object({ action: z.literal('status'), endpoint }).strict(),
  z.object({ action: z.literal('unsubscribe'), endpoint }).strict(),
  z.object({ action: z.literal('test'), endpoint }).strict(),
]);
