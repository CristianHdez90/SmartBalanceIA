import { distanceKm, type Geocoder, type NearbyStore, type NearbyStoreFinder, type NearbyStoreType } from '../domain/promotions';
import { PromotionError } from '../application/promotion-service';

const headers={'User-Agent':'MiBalance/1.0 (personal finance application)','Accept':'application/json'};

export class NominatimGeocoder implements Geocoder {
  constructor(private readonly request:typeof fetch=fetch){}
  async locate(query:string){
    let response:Response;
    try{response=await this.request(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co&q=${encodeURIComponent(query)}`,{headers,signal:AbortSignal.timeout(15000)})}
    catch{throw new PromotionError('No fue posible consultar el sector. Intenta con la ubicación del dispositivo.',504)}
    if(!response.ok)throw new PromotionError('El servicio de ubicación no está disponible en este momento.',502);
    const values=await response.json() as Array<{lat?:string;lon?:string;display_name?:string}>;const first=values[0];
    const latitude=Number(first?.lat),longitude=Number(first?.lon);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new PromotionError('No encontramos ese sector en Colombia. Prueba con barrio, ciudad y departamento.',404);
    return {latitude,longitude,label:String(first.display_name??query).slice(0,220)};
  }
}

function storeType(tags:Record<string,string>):NearbyStoreType {
  if(tags.amenity==='fuel')return 'Estación de gasolina';
  if(tags.shop==='butcher')return 'Carnicería';
  if(tags.shop==='supermarket')return 'Supermercado';
  if(tags.shop==='convenience')return 'Minimercado';
  return 'Otro';
}

export class OverpassNearbyStoreFinder implements NearbyStoreFinder {
  constructor(private readonly request:typeof fetch=fetch){}
  async find(latitude:number,longitude:number,radiusMeters:number){
    const around=`around:${radiusMeters},${latitude},${longitude}`;
    const query=`[out:json][timeout:20];(nwr(${around})[shop~"^(supermarket|convenience|butcher)$"];nwr(${around})[amenity="fuel"];);out center tags 60;`;
    const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
    let response:Response|undefined;
    for(const endpoint of endpoints){
      try{const candidate=await this.request(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(25000)});if(candidate.ok){response=candidate;break}}
      catch{}
    }
    if(!response)throw new PromotionError('Los servicios de comercios cercanos están ocupados. Intenta más tarde.',502);
    const data=await response.json() as {elements?:Array<{id?:number;type?:string;lat?:number;lon?:number;center?:{lat?:number;lon?:number};tags?:Record<string,string>}>};
    return (data.elements??[]).flatMap((item):NearbyStore[]=>{
      const lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon,tags=item.tags??{};
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return [];
      const type=storeType(tags);const name=(tags.name||tags.brand||type).trim();
      const address=[tags['addr:street'],tags['addr:housenumber'],tags['addr:neighbourhood']||tags['addr:suburb']].filter(Boolean).join(' ');
      return [{id:`${item.type??'place'}-${item.id??`${lat}-${lon}`}`,name,type,distanceKm:Number(distanceKm(latitude,longitude,lat!,lon!).toFixed(2)),latitude:lat!,longitude:lon!,address}];
    }).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,40);
  }
}
