## Frecuencia compartida (migración 0019)

La frecuencia se guarda en notification_settings.repeat_seconds al pulsar Guardar preferencias. Controla el push web de todos los navegadores activados de la cuenta y la revisión de la campana. 0 desactiva los envíos automáticos; 86400 conserva un resumen diario; los otros valores permiten repeticiones desde la hora de Colombia configurada. Los pagos saldados y las promociones inactivas o fuera de vigencia dejan de incluirse.

Con la web visible, POST /api/web-push/check revisa solo la cuenta autenticada. GitHub y Vercel comparten el registro de envíos para impedir duplicados concurrentes. Con la web cerrada, la frecuencia es un mínimo entre envíos y depende de la ejecución del cron: no garantiza avisos cada 30 segundos ni cada minuto. El workflow sigue a los minutos 7 y 37. El APK conserva su programación nativa independiente.

Requiere aplicar 0019_notification_repeat.sql y publicar el código para que GitHub Actions consulte el comportamiento nuevo en producción. Las preferencias anteriores conservan una vez al día hasta que el usuario guarde una frecuencia distinta.

# Notificaciones web

Se activan por navegador, con permiso explícito, desde **Notificaciones → Activar notificaciones web**. Después, **Probar aviso** envía una notificación real desde el servidor. No se envían notificaciones de prueba automáticamente.

La hora se configura en **Notificaciones → Preferencias → Hora de los avisos (Colombia)**. Los cambios guardados afectan al siguiente envío sin volver a abrir el teléfono. Hay un resumen al día por suscripción; cambiar la hora después de recibirlo no crea otro envío ese día. Activar un dispositivo después de la hora programada permite recuperar el resumen de hoy en la siguiente ejecución del servidor, sin repetir uno ya enviado.

## Programadores

- Vercel Hobby: `vercel.json` solicita una ejecución diaria a las 13:00 UTC (8:00 Colombia). Puede ejecutarse dentro de esa hora o retrasarse. Solo envía los recordatorios cuya hora guardada ya pasó.
- GitHub Actions: `.github/workflows/web-push.yml` consulta en los minutos 7 y 37 de cada hora. Conserva el intervalo auxiliar previamente guardado en el servidor (30 minutos por defecto). El selector de revisión en pantalla no modifica el workflow ni esta frecuencia. La revisión diaria de Vercel es independiente. Sigue habiendo como máximo un resumen diario por suscripción.
- Ambos usan un registro compartido de envíos con reclamación atómica y bloqueo temporal. Los errores transitorios admiten hasta tres intentos; 404/410 eliminan suscripciones vencidas. El navegador agrupa por día para reducir duplicados si un proveedor recibió el mensaje pero se perdió su respuesta.
- No hay garantía de entrega puntual: GitHub puede retrasar/omitir tareas; en repositorios públicos puede deshabilitarlas tras 60 días sin actividad. Revisar Actions periódicamente. El consumo de minutos depende de la cuenta y otros workflows.

## Configuración

1. `node scripts/setup-web-push.mjs` genera una pareja VAPID y un secreto en `.env.local` (archivo ignorado). No regenera claves existentes ni imprime secretos.
2. Configurar en Vercel **Production** los cuatro valores: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `CRON_SECRET`. No usar prefijos `NEXT_PUBLIC_` para secretos. La clave pública se entrega autenticadamente por `/api/web-push`.
3. En GitHub, Settings → Secrets and variables → Actions, crear `WEB_PUSH_CRON_SECRET` con exactamente el mismo valor de `CRON_SECRET`. No requiere claves VAPID ni acceso a la base de datos.
4. Aplicar `npm run db:migrate` y desplegar. Las migraciones `0015_web_push.sql` y `0016_auxiliary_interval.sql` configuran el envío; `0017_notification_inbox.sql` añade la bandeja persistente y el estado de lectura por cuenta. El build de producción existente también ejecuta migraciones.
5. Abrir la web HTTPS, activar y probar en cada navegador. En iPhone/iPad (16.4+), añadir primero a pantalla de inicio y abrir desde ese icono. No se necesita membresía Apple Developer para Web Push.
6. Verificar una ejecución de **Web Push reminders** en Actions y el cron en Vercel. El endpoint rechaza peticiones sin `Authorization: Bearer <CRON_SECRET>`.

## Privacidad y límites

- Mensajes genéricos: no contienen montos, nombres de obligaciones, productos ni supermercados. El service worker no guarda páginas ni respuestas financieras en caché.
- La suscripción pertenece a la sesión autenticada. Cerrar sesión, desactivar la cuenta o vencer la sesión (actualmente siete días) detiene los envíos. Al iniciar sesión nuevamente, reactivar en ese navegador. Las claves de suscripción se guardan en la base privada.
- Solo se envía a proveedores Web Push conocidos por HTTPS; se rechazan endpoints arbitrarios. Las cuentas solo pueden administrar sus propias suscripciones (máximo diez).
- Se consulta el estado financiero actual en cada ejecución, por lo que los pagos realizados y promociones pausadas se reflejan antes del envío. Solo incluye obligaciones existentes, no genera meses futuros.
- El procesamiento tiene lotes de 100 suscripciones y presupuesto de 45 segundos; los pendientes se retoman en siguientes ejecuciones. No recupera resúmenes de días anteriores.
- Los avisos nativos locales del APK siguen independientes. Activar el APK y la web en el mismo teléfono puede mostrar ambos resúmenes; desactiva uno si no deseas ambos.

## Campana y revisión en pantalla

En **Notificaciones → Preferencias → Revisar notificaciones en pantalla** se puede elegir 30 segundos, 1 minuto, 10 minutos, 20 minutos, 30 minutos, una hora o solo al abrir/actualizar. Se guarda automáticamente por cuenta en ese navegador y funciona mientras la web está visible, desde cualquier sección. No dispara avisos push ni modifica GitHub Actions. También se actualiza al volver a la ventana, abrir la campana y guardar promociones o preferencias.

La campana incluye las promociones habilitadas para el día de Colombia, dentro de su vigencia y con el día de semana seleccionado, aunque ya haya pasado la hora de envío. También incluye pagos pendientes vencidos, que vencen hoy o a los días de anticipación configurados. Respeta las preferencias de pagos/promociones.

Cada aviso tiene un detalle. Abrirlo marca únicamente ese aviso como leído en la base de datos; abrir la campana no marca todos. El punto indica avisos vigentes sin leer. Los avisos leídos o que dejan de estar vigentes permanecen en el historial (se muestran los últimos 100, priorizando pendientes). Cada día genera un aviso distinto para promociones recurrentes. La bandeja no necesita permiso de notificaciones del sistema. Los envíos programados también registran sus detalles en la bandeja.

## Verificación técnica

`node --test tests/notification-inbox.test.mjs tests/web-push.test.mjs tests/reminders.test.mjs`

Prueba aislamiento por cuenta, lectura persistente, promociones diarias, cambio de día en Colombia, pagos resueltos, sesión y revocación, hora personalizada, doble disparo concurrente, endpoints vencidos y reintentos. La entrega push real requiere permiso y prueba en un dispositivo.
