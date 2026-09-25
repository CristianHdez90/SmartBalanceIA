const loopback=new Set(['127.0.0.1','localhost','[::1]']);

function addOrigin(values:Set<string>,value:string|undefined){
 if(!value)return;
 try{values.add(new URL(value).origin)}catch{ /* Configuración inválida: no se autoriza. */ }
}

export function isAllowedOrigin(request:Request){
 const rawOrigin=request.headers.get('origin');
 if(!rawOrigin)return false;
 let supplied:URL;
 try{supplied=new URL(rawOrigin)}catch{return false}

 const requestUrl=new URL(request.url);
 const allowed=new Set<string>([requestUrl.origin]);
 addOrigin(allowed,process.env.APP_PUBLIC_URL?.trim());

 const forwardedHost=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
 const forwardedProto=request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()||requestUrl.protocol.replace(':','');
 if(forwardedHost)addOrigin(allowed,`${forwardedProto}://${forwardedHost}`);
 if(allowed.has(supplied.origin))return true;

 return loopback.has(supplied.hostname)&&loopback.has(requestUrl.hostname)&&supplied.protocol===requestUrl.protocol&&supplied.port===requestUrl.port;
}
