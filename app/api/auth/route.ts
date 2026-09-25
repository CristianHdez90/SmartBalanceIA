import {z,ZodError} from 'zod';
import {AuthError,clearSessionCookie,D1AuthRepository,normalizeEmail,sessionCookie} from '@/src/infrastructure/d1-auth';
import {ResendAuthMailer} from '@/src/infrastructure/resend-auth-mailer';
import {FirebaseAuthService,FirebaseError} from '@/src/infrastructure/firebase-auth';
import {database} from '@/src/infrastructure/database';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';

export const runtime='nodejs';

const email=z.string().trim().email().max(160).transform(normalizeEmail);
const password=z.string().min(10).max(128).regex(/[a-záéíóúñ]/i,'Incluye una letra').regex(/[A-ZÁÉÍÓÚÑ]/,'Incluye una mayúscula').regex(/\d/,'Incluye un número');
const name=z.string().trim().min(2).max(80);
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('login'),email,password:z.string().min(1).max(128)}),
 z.object({action:z.literal('register'),email,displayName:name,password}),
 z.object({action:z.literal('bootstrap'),email,displayName:name,password,bootstrapToken:z.string().max(200).optional()}),
 z.object({action:z.literal('request-reset'),email}),
 z.object({action:z.literal('verify-email'),token:z.string().trim().min(20).max(100)}),
 z.object({action:z.literal('reset-password'),token:z.string().trim().min(20).max(100),password}),
]);
const json=(value:unknown,status=200,headers?:HeadersInit)=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const local=(request:Request)=>['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);
function mailer(){const apiKey=process.env.RESEND_API_KEY?.trim()??'',from=process.env.AUTH_EMAIL_FROM?.trim()??'';return apiKey&&from?new ResendAuthMailer({apiKey,from}):null}
function firebase(){const apiKey=process.env.FIREBASE_WEB_API_KEY?.trim()??'',projectId=process.env.FIREBASE_PROJECT_ID?.trim()??'',serviceAccountEmail=process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim()??'',serviceAccountPrivateKey=process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()??'';return apiKey&&projectId?new FirebaseAuthService({apiKey,projectId,serviceAccountEmail,serviceAccountPrivateKey}):null}
function publicUrl(request:Request){const configured=process.env.APP_PUBLIC_URL?.trim()??'';return (configured||new URL(request.url).origin).replace(/\/$/,'')}
function error(error:unknown){if(error instanceof ZodError)return json({error:'Revisa el correo, nombre y contraseña. Usa mínimo 10 caracteres, una mayúscula y un número.'},400);if(error instanceof AuthError||error instanceof FirebaseError)return json({error:error.message},error.status);if(error instanceof Error)console.error('Authentication request failed',{name:error.name,message:error.message,stack:error.stack});else console.error('Authentication request failed',{type:typeof error});return json({error:'No fue posible completar la solicitud.'},503)}

export async function GET(request:Request){try{const repository=new D1AuthRepository(database());return json({user:await repository.session(request),needsBootstrap:(await repository.countAdmins())===0,local:local(request),authProvider:firebase()?'firebase':'local'})}catch(value){return error(value)}}
export async function POST(request:Request){
 if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const raw=await request.text();if(raw.length>3000)return json({error:'Solicitud demasiado larga.'},413);
  const input=command.parse(JSON.parse(raw));const repository=new D1AuthRepository(database());
  const firebaseAuth=firebase();
  if(input.action==='login'){
   await repository.limited(input.email,'login',10,900000);if(!firebaseAuth){const result=await repository.login(input.email,input.password);return json({user:result.user},200,{'Set-Cookie':sessionCookie(result.token,request)})}
   let profile;try{profile=await firebaseAuth.login(input.email,input.password)}catch(reason){const legacy=await repository.verifyLegacy(input.email,input.password);if(!legacy)throw reason;if(legacy.status==='rejected'||legacy.status==='disabled')throw new AuthError('Esta cuenta no está habilitada.',403);if(legacy.emailVerifiedAt&&firebaseAuth.adminConfigured){const uid=await firebaseAuth.createManagedUser({email:legacy.email,password:input.password,displayName:legacy.displayName,emailVerified:true});await repository.linkFirebase(legacy.id,uid);profile=await firebaseAuth.login(input.email,input.password)}else{const created=await firebaseAuth.register(legacy.email,input.password,legacy.displayName);await repository.linkFirebase(legacy.id,created.uid);throw new AuthError('Tu cuenta fue vinculada con Firebase. Revisa tu correo y confirma el enlace; después podrás iniciar sesión.',403)}}const result=await repository.loginFirebase(profile);return json({user:result.user},200,{'Set-Cookie':sessionCookie(result.token,request)});
  }
  if(input.action==='register'){
   if(!(await repository.countAdmins()))throw new AuthError('Primero debe crearse la cuenta administradora inicial.',409);await repository.limited(input.email,'register',3,3600000);if(firebaseAuth){if(await repository.hasEmail(input.email))throw new AuthError('Ya existe una cuenta con este correo.',409);const created=await firebaseAuth.register(input.email,input.password,input.displayName);await repository.createFirebaseUser(input.email,input.displayName,created.uid);return json({message:'Revisa tu correo y confirma el enlace de Firebase. Después, el administrador aprobará tu cuenta.'},201)}const userId=await repository.createUser(input.email,input.displayName,input.password,'user','pending');const verificationToken=await repository.createEmailVerification(userId);const service=mailer();let sent=false;
   if(service)try{await service.sendVerification(input.email,input.displayName,`${publicUrl(request)}/?verify=${encodeURIComponent(verificationToken)}`,`verify-${userId}`);sent=true}catch{console.error('Verification email delivery failed')}
   return json({message:sent?'Revisa tu correo y confirma el enlace. Después, el administrador aprobará tu cuenta.':'Registro recibido. El correo no pudo enviarse; un administrador puede validar tu dirección y aprobar la cuenta.'},201)
  }
  if(input.action==='bootstrap'){
   const configured=process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();if(!local(request)&&(!configured||input.bootstrapToken!==configured))throw new AuthError('El administrador inicial debe crearse localmente o con el token de instalación.',403);
   if(firebaseAuth){const uid=await firebaseAuth.createManagedUser({email:input.email,password:input.password,displayName:input.displayName,emailVerified:true});const id=await repository.bootstrap(input.email,input.displayName,input.password);await repository.linkFirebase(id,uid);const result=await repository.loginFirebase({uid,email:input.email,emailVerified:true});return json({user:{...result.user,id}},201,{'Set-Cookie':sessionCookie(result.token,request)})}const id=await repository.bootstrap(input.email,input.displayName,input.password);const result=await repository.login(input.email,input.password);return json({user:{...result.user,id}},201,{'Set-Cookie':sessionCookie(result.token,request)});
  }
  if(input.action==='verify-email'){await repository.limited(input.token.slice(0,16),'verify-email',8,3600000);await repository.verifyEmail(input.token);return json({message:'Correo confirmado. Un administrador debe aprobar la cuenta antes de que puedas ingresar.'})}
  if(input.action==='request-reset'&&firebaseAuth){await repository.limited(input.email,'reset',5,3600000);await repository.requestReset(input.email);await firebaseAuth.requestPasswordReset(input.email);return json({message:'Si la cuenta está registrada, Firebase enviará un enlace de recuperación. El administrador también puede generar uno manualmente.'})}
  if(input.action==='request-reset'){
   await repository.limited(input.email,'reset',5,3600000);const reset=await repository.requestReset(input.email);const service=mailer();
   if(reset&&service){const resetToken=await repository.issueReset(null,reset.requestId);try{await service.sendPasswordReset(reset.email,reset.displayName,`${publicUrl(request)}/?reset=${encodeURIComponent(resetToken)}`,`reset-${reset.requestId}`)}catch{await repository.restoreResetRequest(reset.requestId);console.error('Password reset email delivery failed')}}
   return json({message:'Si la cuenta está activa, recibirás un enlace por correo. El administrador también podrá validar la solicitud.'})
  }
  if(firebaseAuth)await firebaseAuth.confirmPasswordReset(input.token,input.password);else await repository.resetPassword(input.token,input.password);return json({message:'Contraseña actualizada. Ya puedes iniciar sesión.'});
 }catch(value){return error(value)}
}
export async function DELETE(request:Request){if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);try{await new D1AuthRepository(database()).logout(request);return json({ok:true},200,{'Set-Cookie':clearSessionCookie(request)})}catch(value){return error(value)}}
