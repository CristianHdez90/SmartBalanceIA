# Notificaciones web

Se activan por navegador, con permiso explícito, desde **Notificaciones → Activar notificaciones web**. Después, **Probar aviso** envía una notificación real desde el servidor. No se envían notificaciones de prueba automáticamente.

La hora se configura en **Notificaciones → Preferencias → Hora de los avisos (Colombia)**. Los cambios guardados afectan al siguiente envío sin volver a abrir el teléfono. Hay un resumen al día por suscripción; cambiar la hora después de recibirlo no crea otro envío ese día. Activar un dispositivo después de la hora programada empieza al día siguiente (la prueba funciona de inmediato).

## Programadores

- Vercel Hobby: `vercel.json` solicita una ejecución diaria a las 13:00 UTC (8:00 Colombia). Puede ejecutarse dentro de esa hora o retrasarse. Solo envía los recordatorios cuya hora guardada ya pasó.
- GitHub Actions: `.github/workflows/web-push.yml` consulta el mismo endpoint en los minutos 7 y 37 de cada hora. Es auxiliar y permite atender horarios posteriores a la ejecución de Vercel. El intervalo de revisión es fijo (30 minutos); la **hora de envío por cuenta** sí es editable en la plataforma. No se modifica el repositorio ni se requiere un token GitHub desde el navegador.
- Ambos usan un registro compartido de envíos con reclamación atómica y bloqueo temporal. Los errores transitorios admiten hasta tres intentos; 404/410 eliminan suscripciones vencidas. El navegador agrupa por día para reducir duplicados si un proveedor recibió el mensaje pero se perdió su respuesta.
- No hay garantía de entrega puntual: GitHub puede retrasar/omitir tareas; en repositorios públicos puede deshabilitarlas tras 60 días sin actividad. Revisar Actions periódicamente. El consumo de minutos depende de la cuenta y otros workflows.

## Configuración

1. `node scripts/setup-web-push.mjs` genera una pareja VAPID y un secreto en `.env.local` (archivo ignorado). No regenera claves existentes ni imprime secretos.
2. Configurar en Vercel **Production** los cuatro valores: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `CRON_SECRET`. No usar prefijos `NEXT_PUBLIC_` para secretos. La clave pública se entrega autenticadamente por `/api/web-push`.
3. En GitHub, Settings → Secrets and variables → Actions, crear `WEB_PUSH_CRON_SECRET` con exactamente el mismo valor de `CRON_SECRET`. No requiere claves VAPID ni acceso a la base de datos.
4. Aplicar `npm run db:migrate` y desplegar. La migración `0015_web_push.sql` solo crea tablas de suscripciones y entregas. El build de producción existente también ejecuta migraciones.
5. Abrir la web HTTPS, activar y probar en cada navegador. En iPhone/iPad (16.4+), añadir primero a pantalla de inicio y abrir desde ese icono. No se necesita membresía Apple Developer para Web Push.
6. Verificar una ejecución de **Web Push reminders** en Actions y el cron en Vercel. El endpoint rechaza peticiones sin `Authorization: Bearer <CRON_SECRET>`.

## Privacidad y límites

- Mensajes genéricos: no contienen montos, nombres de obligaciones, productos ni supermercados. El service worker no guarda páginas ni respuestas financieras en caché.
- La suscripción pertenece a la sesión autenticada. Cerrar sesión, desactivar la cuenta o vencer la sesión (actualmente siete días) detiene los envíos. Al iniciar sesión nuevamente, reactivar en ese navegador. Las claves de suscripción se guardan en la base privada.
- Solo se envía a proveedores Web Push conocidos por HTTPS; se rechazan endpoints arbitrarios. Las cuentas solo pueden administrar sus propias suscripciones (máximo diez).
- Se consulta el estado financiero actual en cada ejecución, por lo que los pagos realizados y promociones pausadas se reflejan antes del envío. Solo incluye obligaciones existentes, no genera meses futuros.
- El procesamiento tiene lotes de 100 suscripciones y presupuesto de 45 segundos; los pendientes se retoman en siguientes ejecuciones. No recupera resúmenes de días anteriores.
- Los avisos nativos locales del APK siguen independientes. Activar el APK y la web en el mismo teléfono puede mostrar ambos resúmenes; desactiva uno si no deseas ambos.

## Verificación técnica

`node --test tests/web-push.test.mjs tests/reminders.test.mjs`

Prueba aislamiento, sesión y revocación, hora personalizada, promociones, pagos previos al envío, doble disparo concurrente, endpoints vencidos y reintentos. La entrega real requiere permiso y prueba en un dispositivo.
