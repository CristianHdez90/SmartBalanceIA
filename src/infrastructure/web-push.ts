import { createHash } from 'node:crypto';
import webpush from 'web-push';
import type { DatabaseClient } from './database';
import { RemindersRepository } from './reminders';
import { bogotaDay } from '../domain/reminders';
import { isPushEndpoint } from '../domain/web-push';

export type PushRow = { id: string; userId: string; endpoint: string; p256dh: string; auth: string; createdAt: number };
export class WebPushError extends Error { constructor(message:string,readonly status:number) { super(message); } }
export const pushSessionHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function pushConfiguration() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY, privateKey = process.env.WEB_PUSH_PRIVATE_KEY, subject = process.env.WEB_PUSH_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}
export async function sendWebPush(row: PushRow, body: string, tag: string) {
  const vapidDetails = pushConfiguration();
  if (!vapidDetails) throw new Error('Web Push no configurado');
  if (!isPushEndpoint(row.endpoint)) throw new Error('Proveedor no permitido');
  await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    JSON.stringify({ title: 'Mi Balance IA', body, tag }),
    { vapidDetails, TTL: 3600, urgency: 'normal', timeout: 10000 });
}
export function pushErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0;
}

export class WebPushRepository {
  constructor(private db: DatabaseClient, private userId: string, private sessionHash: string) {}
  async subscribe(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // Endpoint ownership cannot be reassigned by a different account. A shared browser
    // must unsubscribe its previous local subscription before explicitly enabling again.
    const result = await this.db.prepare(`INSERT INTO web_push_subscriptions(id,user_id,session_hash,endpoint,p256dh,auth,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id=?)<10 OR EXISTS(SELECT 1 FROM web_push_subscriptions WHERE user_id=? AND endpoint=?)
      ON CONFLICT(endpoint) DO UPDATE SET session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at
      WHERE web_push_subscriptions.user_id=excluded.user_id`)
      .bind(crypto.randomUUID(),this.userId,this.sessionHash,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,Date.now(),Date.now(),this.userId,this.userId,subscription.endpoint).run();
    if (!result.meta.changes) throw new WebPushError('No se pudo activar. Desactiva este navegador y vuelve a intentarlo; máximo 10 dispositivos por cuenta.',409);
  }
  async status(endpoint: string) {
    return !!await this.db.prepare('SELECT id FROM web_push_subscriptions WHERE user_id=? AND session_hash=? AND endpoint=?').bind(this.userId,this.sessionHash,endpoint).first();
  }
  async remove(endpoint: string) {
    await this.db.prepare('DELETE FROM web_push_subscriptions WHERE user_id=? AND session_hash=? AND endpoint=?').bind(this.userId,this.sessionHash,endpoint).run();
  }
  async test(endpoint: string) {
    const now = Date.now();
    const claimed = await this.db.prepare(`UPDATE web_push_subscriptions SET last_test_at=? WHERE user_id=? AND session_hash=? AND endpoint=? AND last_test_at<? RETURNING id,user_id AS userId,endpoint,p256dh,auth,created_at AS createdAt`)
      .bind(now,this.userId,this.sessionHash,endpoint,now-60000).first<PushRow>();
    if (!claimed) throw new WebPushError('Activa los avisos y espera un minuto entre pruebas.',429);
    try { await sendWebPush(claimed, 'Las notificaciones de Mi Balance IA están activadas.', 'balance-test'); }
    catch (e) { if ([404,410].includes(pushErrorStatus(e))) await this.remove(endpoint); throw new WebPushError('No se pudo enviar la prueba. Desactiva y vuelve a activar los avisos.',502); }
  }
}

export async function dispatchWebPush(db: DatabaseClient, now = Date.now(), send = sendWebPush, source: 'vercel' | 'github' = 'vercel') {
  const deadline = Date.now()+45000;
  const day = bogotaDay(now), start = Date.parse(`${day}T00:00:00-05:00`);
  // Expired/revoked sessions and disabled accounts never receive reminders.
  await db.prepare(`DELETE FROM web_push_subscriptions WHERE session_hash NOT IN (SELECT s.id_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>? AND u.status='active')`).bind(now).run();
  await db.prepare('DELETE FROM web_push_deliveries WHERE updated_at<?').bind(now-35*86400000).run();
  const rows = (await db.prepare(`SELECT p.id,p.user_id AS userId,p.endpoint,p.p256dh,p.auth,p.created_at AS createdAt
    FROM web_push_subscriptions p LEFT JOIN web_push_deliveries d ON d.subscription_id=p.id AND d.day=?
    LEFT JOIN notification_settings n ON n.user_id=p.user_id
    LEFT JOIN notification_auxiliary_checks a ON a.user_id=p.user_id
    WHERE (d.subscription_id IS NULL OR (d.state!='sent' AND d.attempts<3 AND d.retry_at<=?))
    AND (?='vercel' OR (COALESCE(n.auxiliary_minutes,30)>0 AND (a.checked_at IS NULL OR a.checked_at+COALESCE(n.auxiliary_minutes,30)*60000<=?)))
    AND COALESCE(n.time,'08:00')<=? ORDER BY p.updated_at,p.id LIMIT 100`)
    .bind(day,now,source,now,new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now)).all<PushRow>()).results;
  let sent = 0, failed = 0, processed = 0;
  const plans = new Map<string, Awaited<ReturnType<RemindersRepository['read']>>>();
  const auxiliaryClaims = new Map<string, boolean>();
  for (const row of rows) {
    if(Date.now()>=deadline) break;
    if(source==='github') {
      if(!auxiliaryClaims.has(row.userId)) {
        const claim=await db.prepare(`INSERT INTO notification_auxiliary_checks(user_id,checked_at)
          SELECT ?,? WHERE COALESCE((SELECT auxiliary_minutes FROM notification_settings WHERE user_id=?),30)>0
          ON CONFLICT(user_id) DO UPDATE SET checked_at=excluded.checked_at
          WHERE notification_auxiliary_checks.checked_at+COALESCE((SELECT auxiliary_minutes FROM notification_settings WHERE user_id=?),30)*60000<=?`)
          .bind(row.userId,now,row.userId,row.userId,now).run();
        auxiliaryClaims.set(row.userId,claim.meta.changes>0);
      }
      if(!auxiliaryClaims.get(row.userId)) continue;
    }
    processed++;
    // Rotate evaluated subscriptions so a large set with no reminders cannot starve others.
    await db.prepare('UPDATE web_push_subscriptions SET updated_at=? WHERE id=?').bind(now,row.id).run();
    let data = plans.get(row.userId);
    if (!data) { data = await new RemindersRepository(db,row.userId).read(start-10000); plans.set(row.userId,data); }
    const reminder = data.plan.find(p=>p.id===`balance-${day}` && p.at<=now && p.at>=row.createdAt);
    if (!reminder) continue;
    const claimed = await db.prepare(`INSERT INTO web_push_deliveries(subscription_id,day,state,attempts,retry_at,updated_at)
      SELECT ?,?,'sending',1,?,? WHERE EXISTS(SELECT 1 FROM web_push_subscriptions p JOIN sessions s ON s.id_hash=p.session_hash JOIN users u ON u.id=p.user_id WHERE p.id=? AND s.expires_at>? AND u.status='active')
      ON CONFLICT(subscription_id,day) DO UPDATE SET state='sending',attempts=web_push_deliveries.attempts+1,retry_at=excluded.retry_at,updated_at=excluded.updated_at
      WHERE web_push_deliveries.state!='sent' AND web_push_deliveries.attempts<3 AND web_push_deliveries.retry_at<=?`)
      .bind(row.id,day,now+5*60000,now,row.id,now,now).run();
    if (!claimed.meta.changes) continue;
    try {
      await send(row,reminder.body,reminder.id);
      await db.prepare("UPDATE web_push_deliveries SET state='sent',updated_at=? WHERE subscription_id=? AND day=?").bind(now,row.id,day).run(); sent++;
    } catch(e) {
      if ([404,410].includes(pushErrorStatus(e))) await db.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(row.id).run();
      else await db.prepare("UPDATE web_push_deliveries SET state='failed',updated_at=? WHERE subscription_id=? AND day=?").bind(now,row.id,day).run();
      failed++;
    }
  }
  return { considered:rows.length, processed, sent, failed };
}
