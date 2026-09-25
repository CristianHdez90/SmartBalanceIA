export type AuthMailConfig={apiKey:string;from:string};
export class EmailDeliveryError extends Error{}

const escapeHtml=(value:string)=>value.replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]??character));

export class ResendAuthMailer{
 constructor(private readonly config:AuthMailConfig,private readonly send:typeof fetch=fetch){}
 private async deliver(input:{to:string;subject:string;intro:string;action:string;url:string;note:string;idempotencyKey:string}){
  const response=await this.send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey},body:JSON.stringify({from:this.config.from,to:[input.to],subject:input.subject,text:`${input.intro}\n\n${input.action}: ${input.url}\n\n${input.note}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#12352e;max-width:560px"><h1 style="font-size:22px">Mi Balance</h1><p>${escapeHtml(input.intro)}</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#0b4b3c;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(input.action)}</a></p><p style="color:#5f716c;font-size:14px">${escapeHtml(input.note)}</p></div>`})});
  if(!response.ok)throw new EmailDeliveryError('El proveedor de correo no aceptó el envío.');
 }
 sendVerification(to:string,name:string,url:string,idempotencyKey:string){return this.deliver({to,subject:'Activa tu cuenta de Mi Balance',intro:`Hola ${name}. Confirma que este correo pertenece a tu cuenta. Después, un administrador podrá aprobar tu acceso.`,action:'Confirmar mi correo',url,note:'Este enlace vence en 24 horas y funciona una sola vez.',idempotencyKey})}
 sendPasswordReset(to:string,name:string,url:string,idempotencyKey:string){return this.deliver({to,subject:'Restablece tu contraseña de Mi Balance',intro:`Hola ${name}. Recibimos una solicitud para cambiar la contraseña de tu cuenta.`,action:'Restablecer contraseña',url,note:'Este enlace vence en 30 minutos y funciona una sola vez. Si no hiciste la solicitud, puedes ignorar este mensaje.',idempotencyKey})}
}
