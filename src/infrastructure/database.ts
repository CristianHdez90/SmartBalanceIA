import {createClient,type Client,type InValue,type ResultSet} from '@libsql/client';

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
 async all<T=Record<string,unknown>>(){return output<T>(await this.client.execute(this.toQuery()))}
 async run(){return output(await this.client.execute(this.toQuery()))}
 toQuery(){return {sql:this.sql,args:this.args}}
}

class TursoDatabase implements DatabaseClient{
 constructor(private readonly client:Client){}
 prepare(sql:string){return new TursoStatement(this.client,sql)}
 async batch(statements:DatabaseStatement[]){return (await this.client.batch(statements.map(statement=>statement.toQuery()),'write')).map(result=>output(result))}
}

declare global{var __miBalanceDatabase:DatabaseClient|undefined}

export function database():DatabaseClient{
 const url=process.env.TURSO_DATABASE_URL?.trim();
 if(!url)throw new Error('Falta configurar TURSO_DATABASE_URL.');
 if(!globalThis.__miBalanceDatabase){
  const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
  globalThis.__miBalanceDatabase=new TursoDatabase(createClient({url,...(authToken?{authToken}:{})}));
 }
 return globalThis.__miBalanceDatabase;
}
