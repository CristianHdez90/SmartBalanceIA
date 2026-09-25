export type UserRole='admin'|'user';
export type UserStatus='pending'|'active'|'rejected'|'disabled';
export interface SessionUser{id:string;email:string;displayName:string;role:UserRole;status:UserStatus;emailVerifiedAt:number|null}
export interface ManagedUser extends SessionUser{createdAt:number;approvedAt:number|null;firebaseUid:string|null}
export interface ResetRequest{id:string;userId:string;email:string;displayName:string;status:'requested'|'issued';createdAt:number;expiresAt:number|null}
