export class FirebaseError extends Error {
    code;
    status;
    constructor(message, code, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
const jsonHeaders = { 'Content-Type': 'application/json' };
const base64Url = (value) => { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; let binary = ''; for (const byte of bytes)
    binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };
const firebaseMessage = (code) => {
    const values = { EMAIL_EXISTS: 'Ya existe una cuenta con este correo.', EMAIL_NOT_FOUND: 'Correo o contraseña incorrectos.', INVALID_PASSWORD: 'Correo o contraseña incorrectos.', INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos.', USER_DISABLED: 'Esta cuenta no está habilitada.', INVALID_OOB_CODE: 'El enlace no es válido o ya fue utilizado.', EXPIRED_OOB_CODE: 'El enlace ya venció.', WEAK_PASSWORD: 'La contraseña no cumple los requisitos de seguridad.', TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Espera unos minutos antes de continuar.', OPERATION_NOT_ALLOWED: 'Habilita Correo electrónico/Contraseña en Firebase Authentication.', CONFIGURATION_NOT_FOUND: 'Firebase Authentication todavía no está configurado para este proyecto.', API_KEY_INVALID: 'La clave web de Firebase no es válida.' };
    return values[code] ?? 'Firebase Authentication no pudo completar la solicitud.';
};
export class FirebaseAuthService {
    config;
    send;
    now;
    accessToken = null;
    constructor(config, send = fetch, now = () => Date.now()) {
        this.config = config;
        this.send = send;
        this.now = now;
    }
    get adminConfigured() { const email = this.config.serviceAccountEmail?.trim() ?? '', key = this.config.serviceAccountPrivateKey?.replace(/\\n/g, '\n') ?? ''; return /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/.test(email) && key.includes('-----BEGIN PRIVATE KEY-----') && key.includes('-----END PRIVATE KEY-----') && key.length > 500; }
    async response(response) { const value = await response.json().catch(() => ({})); if (!response.ok) {
        const raw = typeof value.error === 'string' ? value.error_description ?? value.error : value.error?.message;
        const code = String(raw ?? 'FIREBASE_ERROR').split(' : ')[0];
        throw new FirebaseError(firebaseMessage(code), code, response.status === 429 ? 429 : 400);
    } return value; }
    publicPost(method, body) { return this.send(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(this.config.apiKey)}`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(response => this.response(response)); }
    async register(email, password, displayName) {
        const created = await this.publicPost('signUp', { email, password, displayName, returnSecureToken: true });
        await this.publicPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: created.idToken });
        return { uid: created.localId };
    }
    async login(email, password) { const signed = await this.publicPost('signInWithPassword', { email, password, returnSecureToken: true }); const lookup = await this.publicPost('lookup', { idToken: signed.idToken }); const user = lookup.users?.[0]; if (!user)
        throw new FirebaseError('No se pudo consultar la cuenta de Firebase.', 'USER_NOT_FOUND', 404); return { uid: user.localId, email: user.email, emailVerified: !!user.emailVerified, displayName: user.displayName ?? '' }; }
    async requestPasswordReset(email) { try {
        await this.publicPost('sendOobCode', { requestType: 'PASSWORD_RESET', email });
    }
    catch (error) {
        if (error instanceof FirebaseError && error.code === 'EMAIL_NOT_FOUND')
            return;
        throw error;
    } }
    async confirmPasswordReset(oobCode, newPassword) { await this.publicPost('resetPassword', { oobCode, newPassword }); }
    async oauthToken() {
        if (!this.adminConfigured)
            throw new FirebaseError('Falta importar la cuenta de servicio de Firebase para realizar esta acción administrativa.', 'FIREBASE_ADMIN_NOT_CONFIGURED', 503);
        if (this.accessToken && this.accessToken.expiresAt > this.now() + 60000)
            return this.accessToken.value;
        const serviceAccountEmail = this.config.serviceAccountEmail;
        const serviceAccountPrivateKey = this.config.serviceAccountPrivateKey;
        const now = Math.floor(this.now() / 1000), header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), payload = base64Url(JSON.stringify({ iss: serviceAccountEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
        const pem = serviceAccountPrivateKey.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
        const binary = atob(pem), der = Uint8Array.from(binary, character => character.charCodeAt(0));
        const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`)));
        const assertion = `${header}.${payload}.${base64Url(signature)}`;
        const response = await this.send('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
        const result = await this.response(response);
        this.accessToken = { value: result.access_token, expiresAt: this.now() + result.expires_in * 1000 };
        return result.access_token;
    }
    async adminPost(path, body) { const access = await this.oauthToken(); const response = await this.send(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(this.config.projectId)}/${path}`, { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${access}` }, body: JSON.stringify(body) }); return this.response(response); }
    async createManagedUser(input) { const result = await this.adminPost('accounts', { email: input.email, password: input.password, displayName: input.displayName, emailVerified: input.emailVerified, disableUser: false }); return result.localId; }
    async updateUser(uid, input) { await this.adminPost('accounts:update', { localId: uid, ...(input.emailVerified === undefined ? {} : { emailVerified: input.emailVerified }), ...(input.disabled === undefined ? {} : { disableUser: input.disabled }) }); }
    async deleteUser(uid) { try {
        await this.adminPost('accounts:delete', { localId: uid });
    }
    catch (error) {
        if (error instanceof FirebaseError && error.code === 'USER_NOT_FOUND')
            return;
        throw error;
    } }
    async generatePasswordResetLink(email) { const result = await this.adminPost('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email, returnOobLink: true }); return result.oobLink; }
}
