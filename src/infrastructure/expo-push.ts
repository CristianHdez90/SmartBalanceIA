export const isExpoToken=(value:string)=>/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(value);
export async function sendExpoPush(token:string,body:string,tag:string){
 if(!isExpoToken(token))throw new Error('Token de dispositivo no válido');
 const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},body:JSON.stringify({to:token,title:'Mi Balance IA',body,sound:'balance_chime.wav',channelId:'mi-balance-alerts-v2',data:{section:'notifications',tag},ttl:3600}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();
 if(!response.ok||result.data?.status!=='ok'){
  const error=Object.assign(new Error('El servicio push nativo rechazó el aviso'),{statusCode:result.data?.details?.error==='DeviceNotRegistered'?410:response.status>=400?response.status:502});throw error;
 }
 // A ticket acknowledges Expo acceptance; it does not prove device presentation.
 return result.data.id as string;
}
