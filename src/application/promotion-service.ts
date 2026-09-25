import { z } from 'zod';
import type { Geocoder, NearbyStoreFinder, PromotionCacheRepository, PromotionFinder } from '../domain/promotions';

const coordinate=z.number().finite();
export const promotionCommand=z.discriminatedUnion('action',[
  z.object({action:z.literal('geocode'),query:z.string().trim().min(3).max(180)}),
  z.object({action:z.literal('search'),latitude:coordinate.min(-90).max(90),longitude:coordinate.min(-180).max(180),radiusKm:z.number().int().min(1).max(15).default(5),refresh:z.boolean().default(false)}),
]);

export class PromotionError extends Error { constructor(message:string,readonly status=503){super(message)} }

function colombiaDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
async function cacheKey(latitude:number,longitude:number,radiusKm:number){
  const rounded=`${latitude.toFixed(3)}:${longitude.toFixed(3)}:${radiusKm}`;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rounded));
  return Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('');
}

export class PromotionService {
  constructor(private readonly cache:PromotionCacheRepository,private readonly geocoder:Geocoder,private readonly stores:NearbyStoreFinder,private readonly promotions:PromotionFinder,private readonly now:()=>Date=()=>new Date()){}
  async execute(input:unknown){
    const command=promotionCommand.parse(input);
    if(command.action==='geocode')return this.geocoder.locate(command.query);
    const date=colombiaDate(this.now());const key=await cacheKey(command.latitude,command.longitude,command.radiusKm);
    if(!command.refresh){const cached=await this.cache.find(key,date);if(cached)return {...cached,fromCache:true};}
    const stores=await this.stores.find(command.latitude,command.longitude,command.radiusKm*1000);
    const found=await this.promotions.find(stores,date);
    const result={stores,promotions:found.promotions,updatedAt:this.now().getTime(),cacheDate:date,fromCache:false,note:found.note};
    await this.cache.save(key,date,result);
    return result;
  }
}
