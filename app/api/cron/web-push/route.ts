import { timingSafeEqual } from 'node:crypto';
import { database } from '@/src/infrastructure/database';
import { dispatchWebPush, pushConfiguration } from '@/src/infrastructure/web-push';

export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request: Request) {
  const secret=process.env.CRON_SECRET, authorization=request.headers.get('authorization')??'';
  const expected=`Bearer ${secret}`;
  if(!secret || Buffer.byteLength(authorization)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(authorization),Buffer.from(expected))) return new Response('Unauthorized',{status:401});
  if(!pushConfiguration()) return Response.json({error:'Web Push is not configured'},{status:503});
  const source=new URL(request.url).searchParams.get('source')==='github'?'github':'vercel';
  try { const result=await dispatchWebPush(database(),Date.now(),undefined,source); return Response.json(result,{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}}); }
  catch { return Response.json({error:'Dispatch failed'},{status:503}); }
}
