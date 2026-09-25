export type NearbyStoreType = 'Supermercado' | 'Carnicería' | 'Minimercado' | 'Estación de gasolina' | 'Otro';

export interface NearbyStore {
  id: string;
  name: string;
  type: NearbyStoreType;
  distanceKm: number;
  latitude: number;
  longitude: number;
  address: string;
}

export interface PromotionItem {
  id: string;
  product: string;
  store: string;
  offer: string;
  promoPrice: string;
  regularPrice: string;
  discount: string;
  validUntil: string;
  conditions: string;
  sourceUrl: string;
}

export interface PromotionSearchResult {
  stores: NearbyStore[];
  promotions: PromotionItem[];
  updatedAt: number;
  cacheDate: string;
  fromCache: boolean;
  note: string;
}

export interface PromotionCacheRepository {
  find(key: string, date: string): Promise<PromotionSearchResult | null>;
  save(key: string, date: string, value: PromotionSearchResult): Promise<void>;
}

export interface Geocoder {
  locate(query: string): Promise<{ latitude: number; longitude: number; label: string }>;
}

export interface NearbyStoreFinder {
  find(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyStore[]>;
}

export interface PromotionFinder {
  find(stores: NearbyStore[], date: string): Promise<{ promotions: PromotionItem[]; note: string }>;
}

export function distanceKm(lat1:number,lon1:number,lat2:number,lon2:number) {
  const radians=(value:number)=>value*Math.PI/180;
  const earth=6371;
  const dLat=radians(lat2-lat1),dLon=radians(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLon/2)**2;
  return earth*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
