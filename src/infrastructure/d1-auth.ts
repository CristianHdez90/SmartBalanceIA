import type {ManagedUser,ResetRequest,SessionUser,UserRole,UserStatus} from '../domain/auth';
import type {DatabaseClient} from './database';

const encoder=new TextEncoder();
const sessionName='mi_balance_session';
const iterations=210000;
export class AuthError extends Error{constructor(message:string,readonly status=400){super(message)}}
const bytes=(length:number)=>{const value=new Uint8Array(length);crypto.getRandomValues(value);return value};
const hex=(value:ArrayBuffer|Uint8Array)=>Array.from(value instanceof Uint8Array?value:new Uint8Array(value)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(bytes(32)).map(byte=>byte.toString(36).padStart(2,'0')).join('').slice(0,48);
const hash=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function passwordHash(password:string,saltHex:string){
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(saltHex.match(/../g)??[],part=>parseInt(part,16)),iterations},material,256));
}
function equal(a:string,b:string){if(a.length!==b.length)return false;let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);return value===0}
export const normalizeEmail=(value:string)=>value.trim().toLocaleLowerCase('en-US');
export const sessionCookie=(value:string,request:Request,maxAge=604800)=>`${sessionName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export const clearSessionCookie=(request:Request)=>sessionCookie('',request,0);
export function sessionToken(request:Request){const cookie=request.headers.get('cookie')??'';return cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(sessionName+'='))?.slice(sessionName.length+1)??''}

type UserRow={id:string;email:string;displayName:string;passwordHash:string;passwordSalt:string;firebaseUid:string|null;role:UserRole;status:UserStatus;createdAt:number;emailVerifiedAt:number|null;approvedAt:number|null};
const userColumns='id,email,display_name AS displayName,password_hash AS passwordHash,password_salt AS passwordSalt,firebase_uid AS firebaseUid,role,status,created_at AS createdAt,email_verified_at AS emailVerifiedAt,approved_at AS approvedAt';

export class D1AuthRepository{
 constructor(private readonly db:DatabaseClient,private readonly now:()=>number=()=>Date.now()){}
 async countUsers(){const row=await this.db.prepare('SELECT COUNT(*) AS total FROM users').first<{total:number}>();return Number(row?.total??0)}
 async hasEmail(email:string){return !!(await this.db.prepare('SELECT id FROM users WHERE email=?').bind(normalizeEmail(email)).first<{id:string}>())}
 async countAdmins(){const row=await this.db.prepare("SELECT COUNT(*) AS total FROM users WHERE role='admin' AND status='active'").first<{total:number}>();return Number(row?.total??0)}
 async session(request:Request):Promise<SessionUser|null>{
  const raw=sessionToken(request);if(!raw)return null;const idHash=await hash(raw);const row=await this.db.prepare(`SELECT u.id,u.email,u.display_name AS displayName,u.role,u.status,u.email_verified_at AS emailVerifiedAt FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND u.status='active'`).bind(idHash,this.now()).first<SessionUser>();return row??null;
 }
 async requireUser(request:Request){const user=await this.session(request);if(!user)throw new AuthError('Inicia sesión para continuar.',401);return user}
 async requireAdmin(request:Request){const user=await this.requireUser(request);if(user.role!=='admin')throw new AuthError('Esta acción requiere una cuenta administradora.',403);return user}
 async limited(key:string,kind:string,limit:number,windowMs:number){
  const eventKey=await hash(kind+':'+key);const cutoff=this.now()-windowMs;const row=await this.db.prepare('SELECT COUNT(*) AS total FROM auth_events WHERE event_key=? AND kind=? AND created_at>=?').bind(eventKey,kind,cutoff).first<{total:number}>();
  await this.db.prepare('DELETE FROM auth_events WHERE created_at<?').bind(this.now()-86400000*2).run();
  if(Number(row?.total??0)>=limit)throw new AuthError('Demasiados intentos. Espera unos minutos antes de continuar.',429);
  await this.db.prepare('INSERT INTO auth_events (id,event_key,kind,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),eventKey,kind,this.now()).run();
 }
 async createUser(email:string,displayName:string,password:string,role:UserRole,status:UserStatus,firebaseUid:string|null=null){
  const salt=hex(bytes(16));const passwordValue=await passwordHash(password,salt);const id=crypto.randomUUID();
  try{await this.db.prepare('INSERT INTO users (id,email,display_name,password_hash,password_salt,firebase_uid,role,status,created_at,email_verified_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,normalizeEmail(email),displayName.trim(),passwordValue,salt,firebaseUid,role,status,this.now(),role==='admin'?this.now():null,status==='active'?this.now():null).run()}catch{throw new AuthError('Ya existe una cuenta con este correo.',409)}
  return id;
 }
 async createFirebaseUser(email:string,displayName:string,firebaseUid:string){return this.createUser(email,displayName,token(),'user','pending',firebaseUid)}
 async bootstrap(email:string,displayName:string,password:string){
  if(await this.countAdmins())throw new AuthError('El administrador inicial ya fue creado.',409);
  const id=await this.createUser(email,displayName,password,'admin','active');
  await this.db.batch([
   this.db.prepare("UPDATE obligations SET user_id=? WHERE user_id='legacy'").bind(id),this.db.prepare("UPDATE movements SET user_id=? WHERE user_id='legacy'").bind(id),this.db.prepare("UPDATE daily_expenses SET user_id=? WHERE user_id='legacy'").bind(id),this.db.prepare("UPDATE coach_turns SET user_id=? WHERE user_id='legacy'").bind(id),this.db.prepare("UPDATE coach_usage SET user_id=? WHERE user_id='legacy'").bind(id)
  ]);return id;
 }
 async login(email:string,password:string){
  const normalized=normalizeEmail(email);const row=await this.db.prepare(`SELECT ${userColumns} FROM users WHERE email=?`).bind(normalized).first<UserRow>();
  const candidate=await passwordHash(password,row?.passwordSalt??'00000000000000000000000000000000');
  if(!row||!equal(candidate,row.passwordHash))throw new AuthError('Correo o contraseña incorrectos.',401);
  if(row.status==='pending'&&!row.emailVerifiedAt)throw new AuthError('Confirma el enlace enviado a tu correo o solicita al administrador que valide tu dirección.',403);
  if(row.status==='pending')throw new AuthError('Tu correo ya fue validado. La cuenta está pendiente de aprobación por el administrador.',403);
  if(row.status!=='active')throw new AuthError('Esta cuenta no está habilitada.',403);
  const raw=token();await this.db.prepare('INSERT INTO sessions (id_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(await hash(raw),row.id,this.now(),this.now()+604800000).run();return {token:raw,user:{id:row.id,email:row.email,displayName:row.displayName,role:row.role,status:row.status,emailVerifiedAt:row.emailVerifiedAt} satisfies SessionUser};
 }
 async verifyLegacy(email:string,password:string){
  const row=await this.db.prepare(`SELECT ${userColumns} FROM users WHERE email=?`).bind(normalizeEmail(email)).first<UserRow>();if(!row||row.firebaseUid)return null;const candidate=await passwordHash(password,row.passwordSalt);return equal(candidate,row.passwordHash)?row:null;
 }
 async loginFirebase(profile:{uid:string;email:string;emailVerified:boolean}){
  const normalized=normalizeEmail(profile.email);const row=await this.db.prepare(`SELECT ${userColumns} FROM users WHERE firebase_uid=? OR (firebase_uid IS NULL AND email=?) ORDER BY firebase_uid IS NOT NULL DESC LIMIT 1`).bind(profile.uid,normalized).first<UserRow>();if(!row)throw new AuthError('La cuenta no está registrada en Mi Balance.',403);if(row.email!==normalized)throw new AuthError('El correo de Firebase no coincide con la cuenta registrada.',409);
  const verifiedAt=profile.emailVerified?(row.emailVerifiedAt??this.now()):row.emailVerifiedAt;await this.db.prepare('UPDATE users SET firebase_uid=?,email_verified_at=? WHERE id=?').bind(profile.uid,verifiedAt,row.id).run();
  if(!profile.emailVerified)throw new AuthError('Confirma el enlace enviado a tu correo o solicita al administrador que valide tu dirección.',403);if(row.status==='pending')throw new AuthError('Tu correo ya fue validado. La cuenta está pendiente de aprobación por el administrador.',403);if(row.status!=='active')throw new AuthError('Esta cuenta no está habilitada.',403);
  const raw=token();await this.db.prepare('INSERT INTO sessions (id_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(await hash(raw),row.id,this.now(),this.now()+604800000).run();return {token:raw,user:{id:row.id,email:row.email,displayName:row.displayName,role:row.role,status:row.status,emailVerifiedAt:verifiedAt} satisfies SessionUser};
 }
 async firebaseIdentity(userId:string){return this.db.prepare('SELECT firebase_uid AS firebaseUid,email,display_name AS displayName,email_verified_at AS emailVerifiedAt,status FROM users WHERE id=?').bind(userId).first<{firebaseUid:string|null;email:string;displayName:string;emailVerifiedAt:number|null;status:UserStatus}>()}
 async linkFirebase(userId:string,firebaseUid:string){await this.db.prepare('UPDATE users SET firebase_uid=? WHERE id=? AND firebase_uid IS NULL').bind(firebaseUid,userId).run()}
 async logout(request:Request){const raw=sessionToken(request);if(raw)await this.db.prepare('DELETE FROM sessions WHERE id_hash=?').bind(await hash(raw)).run()}
 async createEmailVerification(userId:string){
  await this.db.prepare("UPDATE email_verifications SET status='cancelled' WHERE user_id=? AND status='pending'").bind(userId).run();
  const raw=token();await this.db.prepare("INSERT INTO email_verifications (id,user_id,token_hash,status,created_at,expires_at) VALUES (?,?,?,'pending',?,?)").bind(crypto.randomUUID(),userId,await hash(raw),this.now(),this.now()+86400000).run();return raw;
 }
 async verifyEmail(rawToken:string){
  const tokenHash=await hash(rawToken.trim());const row=await this.db.prepare("SELECT id,user_id AS userId,expires_at AS expiresAt FROM email_verifications WHERE token_hash=? AND status='pending'").bind(tokenHash).first<{id:string;userId:string;expiresAt:number}>();
  if(!row||row.expiresAt<this.now())throw new AuthError('El enlace de activación no es válido o ya venció.',400);
  await this.db.batch([this.db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').bind(this.now(),row.userId),this.db.prepare("UPDATE email_verifications SET status='used' WHERE id=?").bind(row.id),this.db.prepare("UPDATE email_verifications SET status='cancelled' WHERE user_id=? AND id<>? AND status='pending'").bind(row.userId,row.id)]);
 }
 async markEmailVerified(adminId:string,userId:string){
  const result=await this.db.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND role<>'admin'").bind(this.now(),userId).run();if(!result.meta.changes)throw new AuthError('La cuenta no existe o no puede modificarse.',404);
  await this.db.prepare("UPDATE email_verifications SET status='cancelled',verified_by=? WHERE user_id=? AND status='pending'").bind(adminId,userId).run();
 }
 async requestReset(email:string){
  const user=await this.db.prepare("SELECT id,email,display_name AS displayName FROM users WHERE email=? AND status='active'").bind(normalizeEmail(email)).first<{id:string;email:string;displayName:string}>();if(!user)return null;
  await this.db.prepare("UPDATE password_reset_requests SET status='cancelled' WHERE user_id=? AND status IN ('requested','issued')").bind(user.id).run();
  const id=crypto.randomUUID();await this.db.prepare("INSERT INTO password_reset_requests (id,user_id,status,created_at) VALUES (?,?,'requested',?)").bind(id,user.id,this.now()).run();return {...user,requestId:id};
 }
 async resetPassword(rawToken:string,password:string){
  const row=await this.db.prepare("SELECT id,user_id AS userId,token_hash AS tokenHash,expires_at AS expiresAt FROM password_reset_requests WHERE token_hash=? AND status='issued' ORDER BY created_at DESC LIMIT 1").bind(await hash(rawToken.trim())).first<{id:string;userId:string;tokenHash:string;expiresAt:number}>();
  if(!row||row.expiresAt<this.now()||!equal(await hash(rawToken.trim()),row.tokenHash))throw new AuthError('El código no es válido o ya venció.',400);
  const salt=hex(bytes(16));const passwordValue=await passwordHash(password,salt);
  await this.db.batch([this.db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(passwordValue,salt,row.userId),this.db.prepare("UPDATE password_reset_requests SET status='used' WHERE id=?").bind(row.id),this.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.userId)]);
 }
 async listUsers(){const rows=await this.db.prepare(`SELECT ${userColumns} FROM users ORDER BY created_at DESC`).all<UserRow>();return rows.results.map(({passwordHash:_,passwordSalt:__,...user})=>user as ManagedUser)}
 async listResets(){const rows=await this.db.prepare("SELECT r.id,r.user_id AS userId,u.email,u.display_name AS displayName,r.status,r.created_at AS createdAt,r.expires_at AS expiresAt FROM password_reset_requests r JOIN users u ON u.id=r.user_id WHERE r.status IN ('requested','issued') ORDER BY r.created_at DESC").all<ResetRequest>();return rows.results}
 async setStatus(adminId:string,userId:string,status:UserStatus){
  if(adminId===userId&&status!=='active')throw new AuthError('No puedes desactivar tu propia cuenta administradora.',400);
  if(status==='active'){const user=await this.db.prepare('SELECT email_verified_at AS emailVerifiedAt FROM users WHERE id=?').bind(userId).first<{emailVerifiedAt:number|null}>();if(!user?.emailVerifiedAt)throw new AuthError('Valida el correo de esta cuenta antes de aprobarla.',409)}
  await this.db.prepare("UPDATE users SET status=?,approved_at=CASE WHEN ?='active' THEN ? ELSE approved_at END,approved_by=? WHERE id=? AND role<>'admin'").bind(status,status,this.now(),adminId,userId).run();
  if(status!=='active')await this.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
 }
 async issueReset(approvedBy:string|null,requestId:string){
  const raw=token();const result=await this.db.prepare("UPDATE password_reset_requests SET token_hash=?,status='issued',expires_at=?,approved_by=? WHERE id=? AND status='requested'").bind(await hash(raw),this.now()+1800000,approvedBy,requestId).run();
  if(!result.meta.changes)throw new AuthError('La solicitud ya fue atendida.',409);return raw;
 }
 async restoreResetRequest(requestId:string){await this.db.prepare("UPDATE password_reset_requests SET token_hash=NULL,status='requested',expires_at=NULL,approved_by=NULL WHERE id=? AND status='issued'").bind(requestId).run()}
 async markResetIssued(adminId:string,requestId:string){const result=await this.db.prepare("UPDATE password_reset_requests SET status='issued',expires_at=?,approved_by=? WHERE id=? AND status='requested'").bind(this.now()+3600000,adminId,requestId).run();if(!result.meta.changes)throw new AuthError('La solicitud ya fue atendida.',409)}
}
