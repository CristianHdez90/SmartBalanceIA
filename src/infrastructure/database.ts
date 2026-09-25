import {createClient,LibsqlError,type Client,type InValue,type ResultSet} from '@libsql/client';

export class DatabaseError extends Error{constructor(message:string,readonly code:string){super(message)}}

function databaseError(value:unknown){
 if(value instanceof DatabaseError)return value;
 if(value instanceof LibsqlError){
  const detail=value.message.toLowerCase();
  if(value.code==='URL_INVALID')return new DatabaseError('TURSO_DATABASE_URL no es válida. Revisa la variable en Vercel.','URL_INVALID');
  if(/auth|token|unauthorized|401|403/.test(detail))return new DatabaseError('TURSO_AUTH_TOKEN no es válido o no pertenece a la base configurada.','AUTH_INVALID');
  if(/no such table/.test(detail))return new DatabaseError('La base de Turso no tiene el esquema. Ejecuta npm run db:migrate con las mismas credenciales de Vercel.','SCHEMA_MISSING');
  console.error('Turso request failed',{code:value.code});
 }
 return new DatabaseError('No fue posible conectar con la base Turso configurada en Vercel.','DATABASE_UNAVAILABLE');
}

export type DatabaseResult<T=Record<string,unknown>>={results:T[];meta:{changes:number}};

export interface DatabaseStatement{
 bind(...values:InValue[]):DatabaseStatement;
 first<T=Record<string,unknown>>():Promise<T|null>;
 all<T=Record<string,unknown>>():Promise<DatabaseResult<T>>;
 run():Promise<DatabaseResult>;
 toQuery():{sql:string;args:InValue[]};
}

export interface DatabaseClient{
 prepare(sql:string):DatabaseStatement;
 batch(statements:DatabaseStatement[]):Promise<DatabaseResult[]>;
}

function rows<T>(result:ResultSet){return result.rows.map(row=>Object.fromEntries(result.columns.map(column=>[column,row[column]])) as T)}
function output<T=Record<string,unknown>>(result:ResultSet):DatabaseResult<T>{return {results:rows<T>(result),meta:{changes:result.rowsAffected}}}

class TursoStatement implements DatabaseStatement{
 constructor(private readonly client:Client,private readonly sql:string,private readonly args:InValue[]=[]){ }
 bind(...values:InValue[]){return new TursoStatement(this.client,this.sql,values)}
 async first<T=Record<string,unknown>>(){return (await this.all<T>()).results[0]??null}
 async all<T=Record<string,unknown>>(){try{return output<T>(await this.client.execute(this.toQuery()))}catch(value){throw databaseError(value)}}
 async run(){try{return output(await this.client.execute(this.toQuery()))}catch(value){throw databaseError(value)}}
 toQuery(){return {sql:this.sql,args:this.args}}
}

class TursoDatabase implements DatabaseClient{
 constructor(private readonly client:Client){}
 prepare(sql:string){return new TursoStatement(this.client,sql)}
 async batch(statements:DatabaseStatement[]){try{return (await this.client.batch(statements.map(statement=>statement.toQuery()),'write')).map(result=>output(result))}catch(value){throw databaseError(value)}}
}

declare global{var __miBalanceDatabase:DatabaseClient|undefined}

export function database():DatabaseClient{
 const url=process.env.TURSO_DATABASE_URL?.trim();
 if(!url)throw new DatabaseError('Falta configurar TURSO_DATABASE_URL en Vercel.','URL_MISSING');
 if(!globalThis.__miBalanceDatabase){
  const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
  if(!url.startsWith('file:')&&!authToken)throw new DatabaseError('Falta configurar TURSO_AUTH_TOKEN en Vercel.','TOKEN_MISSING');
  try{globalThis.__miBalanceDatabase=new TursoDatabase(createClient({url,...(authToken?{authToken}:{})}))}catch(value){throw databaseError(value)}
 }
 return globalThis.__miBalanceDatabase;
}
