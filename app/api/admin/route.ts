import {z,ZodError} from 'zod';
import {AuthError,D1AuthRepository} from '@/src/infrastructure/d1-auth';
import {FirebaseAuthService,FirebaseError} from '@/src/infrastructure/firebase-auth';
import {database,DatabaseError} from '@/src/infrastructure/database';
import {isAllowedOrigin} from '@/src/infrastructure/request-origin';
export const runtime='nodejs';
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('status'),userId:z.string().uuid(),status:z.enum(['active','rejected','disabled'])}),
 z.object({action:z.literal('verify-email'),userId:z.string().uuid()}),
 z.object({action:z.literal('issue-reset'),requestId:z.string().uuid()}),
]);
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function repository(){return new D1AuthRepository(database())}
function firebase(){const apiKey=process.env.FIREBASE_WEB_API_KEY?.trim()??'',projectId=process.env.FIREBASE_PROJECT_ID?.trim()??'',serviceAccountEmail=process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim()??'',serviceAccountPrivateKey=process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()??'';return apiKey&&projectId?new FirebaseAuthService({apiKey,projectId,serviceAccountEmail,serviceAccountPrivateKey}):null}
function error(value:unknown){if(value instanceof ZodError)return json({error:'Solicitud administrativa inválida.'},400);if(value instanceof AuthError||value instanceof FirebaseError)return json({error:value.message},value.status);if(value instanceof DatabaseError)return json({error:value.message,code:value.code},503);console.error('Admin request failed');return json({error:'No se pudo completar la operación administrativa.'},503)}
export async function GET(request:Request){try{const repo=repository();await repo.requireAdmin(request);return json({users:await repo.listUsers(),resets:await repo.listResets()})}catch(value){return error(value)}}
export async function POST(request:Request){if(!isAllowedOrigin(request))return json({error:'Origen no permitido.'},403);try{const repo=repository();const admin=await repo.requireAdmin(request);const input=command.parse(await request.json()),firebaseAuth=firebase();if(input.action==='status'){const identity=await repo.firebaseIdentity(input.userId);if(input.status!=='active'&&firebaseAuth&&identity?.firebaseUid)await firebaseAuth.updateUser(identity.firebaseUid,{disabled:true});await repo.setStatus(admin.id,input.userId,input.status);return json({ok:true})}if(input.action==='verify-email'){const identity=await repo.firebaseIdentity(input.userId);if(firebaseAuth&&identity?.firebaseUid)await firebaseAuth.updateUser(identity.firebaseUid,{emailVerified:true});await repo.markEmailVerified(admin.id,input.userId);return json({ok:true})}if(firebaseAuth){const reset=(await repo.listResets()).find(item=>item.id===input.requestId);if(!reset)throw new AuthError('La solicitud ya fue atendida.',409);const link=await firebaseAuth.generatePasswordResetLink(reset.email);await repo.markResetIssued(admin.id,input.requestId);return json({resetLink:link,expiresInMinutes:30})}const token=await repo.issueReset(admin.id,input.requestId);return json({token,expiresInMinutes:30})}catch(value){return error(value)}}
