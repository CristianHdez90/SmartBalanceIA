import * as Notifications from 'expo-notifications';
import {AndroidImportance,AndroidNotificationVisibility} from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';
const OWNER='mi-balance-remote-push-owner',TOKEN='mi-balance-remote-push-token';
export async function handleNativePush(raw:string){
 if(raw.length>2048)throw new Error('Solicitud demasiado grande');
 const r=JSON.parse(raw);
 if(r.type!=='mi-balance-push'||!['sync','enable','disable','test','clear'].includes(r.action)||typeof r.id!=='string'||! /^[\w-]{1,80}$/.test(r.id)|| (r.action!=='clear'&&(typeof r.userId!=='string'||!/^[\w-]{1,100}$/.test(r.userId))))throw new Error('Solicitud no válida');
 try{
  const owner=await SecureStore.getItemAsync(OWNER),previous=await SecureStore.getItemAsync(TOKEN);
  if(r.action==='clear'||r.action==='disable'||(owner&&owner!==r.userId)){
   await SecureStore.deleteItemAsync(OWNER);await SecureStore.deleteItemAsync(TOKEN);await Notifications.cancelAllScheduledNotificationsAsync();await Notifications.dismissAllNotificationsAsync();
   if(r.action!=='enable')return {id:r.id,enabled:false,token:r.action==='disable'?previous:null};
  }
  if(r.action!=='enable'&&owner!==r.userId)return {id:r.id,enabled:false};
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('mi-balance-alerts-v2',{name:'Pagos y promociones',importance:AndroidImportance.HIGH,sound:'balance_chime.wav',lockscreenVisibility:AndroidNotificationVisibility.PRIVATE});
  const permission=r.action==='enable'?await Notifications.requestPermissionsAsync():await Notifications.getPermissionsAsync();
  if(!permission.granted)throw new Error('Activa el permiso de notificaciones en los ajustes del teléfono.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId:'24eba997-66b7-4fca-9275-6716ae121f31'})).data;
  await SecureStore.setItemAsync(OWNER,r.userId);await SecureStore.setItemAsync(TOKEN,token);
  // Retire the previous daily calendar to avoid duplicate and stale local reminders.
  await Notifications.cancelAllScheduledNotificationsAsync();
  return {id:r.id,enabled:true,token};
 }catch{return {id:r.id,enabled:false,error:'No se pudo activar push nativo. Comprueba internet, permisos y la configuración FCM de esta versión del APK.'};}
}
