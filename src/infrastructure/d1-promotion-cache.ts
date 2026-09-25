import type { PromotionCacheRepository, PromotionSearchResult } from '../domain/promotions';
import type {DatabaseClient} from './database';

export class D1PromotionCache implements PromotionCacheRepository {
  constructor(private readonly db:DatabaseClient){}
  async find(key:string,date:string){
    const row=await this.db.prepare('SELECT payload FROM promotion_cache WHERE cache_key=? AND cache_date=?').bind(key,date).first<{payload:string}>();
    if(!row)return null;
    try{return JSON.parse(row.payload) as PromotionSearchResult}catch{return null}
  }
  async save(key:string,date:string,value:PromotionSearchResult){
    await this.db.prepare(`INSERT INTO promotion_cache (cache_key,cache_date,payload,created_at) VALUES (?,?,?,?)
      ON CONFLICT(cache_key) DO UPDATE SET cache_date=excluded.cache_date,payload=excluded.payload,created_at=excluded.created_at`).bind(key,date,JSON.stringify(value),Date.now()).run();
  }
}
