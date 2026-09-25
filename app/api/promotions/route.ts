import { ZodError } from 'zod';
import { PromotionError, PromotionService } from '@/src/application/promotion-service';
import { D1PromotionCache } from '@/src/infrastructure/d1-promotion-cache';
import { GroqPromotionFinder } from '@/src/infrastructure/groq-promotion-finder';
import { NominatimGeocoder, OverpassNearbyStoreFinder } from '@/src/infrastructure/openstreetmap-location';
import { AuthError, D1AuthRepository } from '@/src/infrastructure/d1-auth';
import {database} from '@/src/infrastructure/database';

function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}})}

export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
  try{
    const db=database();
    await new D1AuthRepository(db).requireUser(request);
    const raw=await request.text();if(raw.length>2000)return json({error:'La solicitud es demasiado larga.'},413);
    const input=JSON.parse(raw) as {action?:unknown};
    const key=process.env.GROQ_API_KEY?.trim()??'';
    if(input.action==='search'&&!key)return json({error:'Falta configurar la clave de Groq para buscar promociones actuales.'},503);
    const service=new PromotionService(new D1PromotionCache(db),new NominatimGeocoder(),new OverpassNearbyStoreFinder(),new GroqPromotionFinder(key));
    return json(await service.execute(input));
  }catch(error){
    if(error instanceof SyntaxError||error instanceof ZodError)return json({error:'Revisa la ubicación y selecciona un radio entre 1 y 15 km.'},400);
    if(error instanceof PromotionError||error instanceof AuthError)return json({error:error.message},error.status);
    console.error('Nearby promotions request failed');return json({error:'No se pudo completar la consulta de promociones. Intenta nuevamente.'},503);
  }
}
