# Mi Balance

Plataforma personal para registrar obligaciones mensuales, ingresos del trabajo y abonos en pesos colombianos. La información se guarda en SQLite (Cloudflare D1), no en el navegador.

## Arquitectura

- `src/domain`: entidades, cálculos puros y transcripción de la referencia. No depende del framework ni de la base de datos.
- `src/application`: casos de uso, validación de comandos y puerto `LedgerRepository` definido en dominio.
- `src/infrastructure`: adaptador D1 inyectable; SQL preparado, operaciones atómicas y claves de idempotencia.
- `src/presentation`: interfaz React y formularios accesibles, con estados de carga y recuperación de errores.
- `app/api/ledger`: adaptación HTTP y composición de dependencias; verifica origen en escrituras.
- `db/schema.ts` y `drizzle/`: esquema y migraciones versionadas.

## Reglas

La tabla muestra el último pago o abono fechado. La pestaña **Reporte de pagos** clasifica las obligaciones del mes seleccionado según la fecha de Colombia: vencido cuando queda saldo y la fecha límite ya pasó; próximo a vencer desde hoy hasta 7 días inclusive; cumplido a tiempo cuando el total quedó pagado con fechas conocidas hasta el vencimiento inclusive. Distingue pagos fuera de plazo, pagos sin fecha, fechas límite desconocidas y valores no definidos. No combina obligaciones de otros meses: usa el selector mensual para revisar su reporte. Se actualiza al guardar o eliminar movimientos y al cambiar el día. Los importes de las tarjetas de pendientes representan el saldo restante.

Cada obligación admite fecha de corte y fecha límite de pago opcionales, visibles en la tabla y editables con el lápiz. Se validan fechas reales y se permiten ciclos entre meses distintos. Las fechas quedan por definir en meses nuevos para evitar copiar vencimientos antiguos; los pagos realizados conservan su propia fecha en el historial.

Los importes se guardan como pesos enteros, evitando errores de punto flotante. Se permiten abonos parciales; el servidor impide superar el saldo incluso ante solicitudes simultáneas. Los identificadores de movimiento evitan duplicar reintentos. Una obligación no puede reducirse por debajo de lo pagado. El historial permite eliminar un movimiento erróneo tras confirmar.

La pestaña **Gastos diarios** registra consumos por fecha, categoría, descripción y valor. Incluye restaurante, gasolina, mantenimiento de vehículo, merienda escolar, mercado, paseo, medicina, cervezas y otros. Cada gasto descuenta el disponible mensual; puede editarse o eliminarse y el resumen se recalcula inmediatamente. El asistente recibe únicamente los totales agrupados por categoría cuando el resumen está activado, sin las descripciones de cada compra.

Agosto de 2026 contiene las 18 obligaciones de la imagen y sus 9 pagos. Tres valores y la fecha del pago del vehículo no están informados; se conservan como desconocidos. No se inventan ingresos. Al abrir un mes nuevo se copian las obligaciones del último mes anterior disponible, sin pagos. Los cambios posteriores no alteran meses ya creados. Los saldos disponibles son mensuales, sin arrastre automático del efectivo de meses anteriores.

## Desarrollo

Requiere Node 22.13 o posterior.

```sh
npm run install:ci
npm run db:generate
npm run dev
```

El servidor de desarrollo usa el puerto 5173. Para compilar: `npm run build`. Para comprobar tipos: `npx tsc --noEmit`. Para pruebas de reglas e integración SQLite: `node scripts/test-ledger.mjs`.

Tras compilar por primera vez, aplica la migración local una sola vez:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_windy_franklin_storm.sql
```

En este proyecto ya se aplicó a la base local. No la repitas. Para abrir la versión compilada en `http://127.0.0.1:8787`:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --inspector-port 0
```

Los datos locales viven en `.wrangler/state`; conserva esa carpeta para mantener tus registros. No forma parte del código publicado. Producción aplica las migraciones durante el despliegue y utiliza una base independiente. La publicación está pendiente de autorización explícita para enviar el código y los datos iniciales de la imagen al espacio privado de Sites.

## Acceso y alcance

Despliegue privado para el propietario mediante el control de acceso de Sites. Es una aplicación personal con una única contabilidad; no debe hacerse pública ni compartirse como servicio multiusuario sin incorporar autorización por usuario en cada consulta y separación de datos. El desarrollo local solo debe exponerse en loopback. El sitio registra pagos manualmente: no realiza transferencias bancarias. WebMCP expone únicamente una consulta de los datos visibles y detecta soporte antes de registrarse.

## Extensión

## Asistente de finanzas con IA

La pestaña **Asistente IA** usa OpenAI Responses API desde el servidor. Incluye consultas generales y un interruptor explícito para enviar el resumen actualizado del mes. Omite nombres de obligaciones, números de cuenta, notas y descripciones de movimientos del resumen automático. El contenido escrito por el usuario y las últimas seis consultas de esa conversación sí se envían. Usa `store:false`; esto desactiva el almacenamiento de respuestas para recuperación vía API, no constituye una garantía de retención cero del proveedor. Véase [documentación oficial](https://developers.openai.com/api/docs/guides/your-data).

Las conversaciones se guardan en D1, separadas por mes y por modo con/sin resumen. La IA no tiene herramientas para crear, modificar ni reversar pagos. Lee los datos vigentes en cada consulta y advierte sobre valores incompletos, gastos diarios ausentes y la diferencia entre cuota mensual y saldo de capital. El modelo predeterminado es `gpt-5-mini`, configurable con `OPENAI_MODEL`. No tiene navegación web; no debe presentar tasas o normativa como verificadas.

### Activación local

1. Obtén una clave en tu cuenta de OpenAI API con facturación y acceso al modelo. El consumo de API se factura por separado de esta aplicación.
2. Ejecuta `powershell -File scripts/configure-ai.ps1` desde este proyecto. La entrada es oculta y se guarda únicamente en `.env.local`, ignorado por Git. Alternativamente copia `.env.example` a `.env.local` y completa el valor directamente en tu editor. No pegues claves en el chat ni en el código fuente.
3. Reinicia con `npm start` (o `node scripts/start-local.mjs`). El lanzador pasa el archivo privado a Wrangler mediante `--env-file`; no incorpora la clave al código del navegador.
4. Abre **Asistente IA** y pulsa **Comprobar conexión**. La presencia de la clave habilita el formulario; el primer envío comprueba realmente las credenciales y el acceso al modelo.

En otra instalación, aplica también `drizzle/0002_daffy_infant_terrible.sql` una sola vez con el comando D1 local documentado arriba. En hosting configura `OPENAI_API_KEY` como secreto de Sites y `OPENAI_MODEL` como variable; no subas `.env.local`. La publicación sigue pendiente de autorización explícita.

El servidor valida origen y sesión, y limita a 30 intentos diarios de IA por usuario, contando errores. Hay un máximo de 2000 caracteres por consulta, 3500 tokens de salida por respuesta, timeout de 60 segundos y una sola consulta simultánea por conversación. Las peticiones repetidas con el mismo ID recuperan la respuesta ya guardada; no hacen otra llamada facturable.

Verificaciones: `node scripts/test-coach.mjs` valida privacidad del contexto, límites, historial, idempotencia y el contrato HTTP con respuestas simuladas. Una prueba real necesita la clave y debe usar datos ficticios o contar con autorización para compartir datos personales.

### Cambiar el almacenamiento

Para cambiar de almacenamiento se implementa `LedgerRepository`, sin modificar los cálculos ni casos de uso. La identidad activa se inyecta en los repositorios D1 y todas las consultas de obligaciones, movimientos, gastos y chat filtran por usuario. Para pagos bancarios implementar un caso de uso independiente con verificación de proveedor; no convertir un registro manual en una transferencia implícita.

La migración local `0001_acoustic_iceman.sql` agrega las fechas de corte y pago; ya está aplicada en esta instalación. En instalaciones existentes distintas, aplícala una sola vez con el mismo comando de migración, cambiando el nombre del archivo.



## Asistente con Groq
El chat utiliza Groq y llama-3.3-70b-versatile. Crea una clave en https://console.groq.com/keys y configura GROQ_API_KEY en .env.local (solo servidor). GROQ_MODEL permite elegir otro modelo compatible. Reinicia npm start después de cambiar la clave. El plan gratuito tiene cuotas del proveedor. Las consultas y, con consentimiento, el resumen anónimo se envían a Groq. No se modifica la contabilidad. La conexión anterior de OpenAI queda sin uso.
Validación: node scripts/test-coach.mjs.

## Configuración mensual de obligaciones
Días de corte y límite de pago (1–31) reutilizados cada mes; días inexistentes se ajustan al último día. El mes seleccionado representa el mes de vencimiento. Los cambios en días, banco, enlace HTTPS, saldo total manual y tasas M.V./E.A. se propagan a las instancias futuras existentes y a los meses nuevos, conservando meses anteriores. La cuota mensual y pagos se administran por separado. El saldo total no se amortiza automáticamente. Las tasas son porcentajes independientes del extracto. La IA recibe el saldo y tasas únicamente con el resumen activado; no recibe el enlace bancario. Migración 0003_careless_queen_noir.sql aplicada localmente, con copia previa en .sites-runtime.


## Limpiar chat
Asistente IA incluye Limpiar todo el chat con confirmación. DELETE /api/coach valida origen y sesión, elimina preguntas y respuestas de todos los meses y bloquea la operación si hay una consulta activa. Conserva solo identificadores y fechas de intentos para respetar el límite diario; no cambia la contabilidad. Pruebas con base temporal en scripts/test-coach.mjs. Migración 0004_orange_bushwacker.sql aplicada localmente.


## Cuota de créditos: alcance opcional
Al editar créditos o tarjetas, Actualizar también el valor de la cuota en los meses siguientes está desmarcado por defecto. Sin marcar, solo modifica la cuota del mes seleccionado y conserva recurring_amount como base para nuevos meses. Marcado, modifica cuotas y base de todas las instancias posteriores de la misma serie. Los movimientos no se copian ni se alteran. Se rechaza toda la operación si un mes incluido ya tiene pagos mayores que la nueva cuota. Fechas y metadatos conservan su alcance recurrente previo. Migración 0005_silent_marvex.sql aplicada localmente con copia previa.

## Gastos diarios
La migración `0006_greedy_hiroim.sql` crea el almacenamiento separado de gastos diarios y sus índices por mes, fecha y categoría. Está aplicada en la base local de esta instalación. En otra instalación existente debe ejecutarse una sola vez con el comando D1 documentado arriba, cambiando el nombre del archivo.

## Promociones cercanas

La pestaña **Promociones** permite usar la ubicación autorizada por el navegador o buscar una dirección, barrio o sector en Colombia. OpenStreetMap/Nominatim convierte el texto a coordenadas y Overpass encuentra supermercados, minimercados, carnicerías y estaciones de gasolina en un radio de 1 a 15 km. Groq recibe solamente los nombres públicos de esos comercios y usa búsqueda web para encontrar promociones vigentes con enlace a la fuente; no recibe la dirección ni las coordenadas.

La consulta se ejecuta automáticamente una vez por día cuando se abre la pestaña. El resultado diario queda en D1 bajo una clave SHA-256 construida con coordenadas redondeadas y radio; la ubicación elegida se conserva únicamente en el almacenamiento local del navegador. **Actualizar ahora** permite saltar la caché. Las promociones son información pública orientativa: la interfaz pide confirmar vigencia, inventario y cobertura en la sede antes de comprar. Si la aplicación está cerrada no ejecuta consultas en segundo plano.

La migración `0007_eager_shockwave.sql` crea la caché diaria y ya está aplicada en la base local de esta instalación. En otra instalación existente debe aplicarse una sola vez. La funcionalidad requiere `GROQ_API_KEY` y el modelo `openai/gpt-oss-20b` con acceso a Browser Search. Validación sin llamadas externas: `node scripts/test-promotions.mjs`.

## Cuentas y administración

La aplicación admite múltiples usuarios. El registro crea una cuenta pendiente; solo un administrador puede aprobarla, rechazarla o deshabilitarla. Cada sesión usa una cookie HTTP-only, SameSite Strict y Secure cuando se sirve por HTTPS. Las contraseñas se derivan con PBKDF2-SHA-256, sal individual y 210.000 iteraciones; la base no guarda contraseñas ni tokens de sesión en texto claro.

La primera apertura local muestra **Crear administrador inicial**. Esa cuenta reclama los datos que existían antes de la migración; las cuentas nuevas comienzan sin obligaciones ni movimientos. En una instalación remota vacía, configura `ADMIN_BOOTSTRAP_TOKEN` como secreto y úsalo durante el aprovisionamiento del primer administrador.

El registro envía un enlace de activación de un solo uso, válido por 24 horas. Después de confirmar el correo, la cuenta continúa pendiente hasta que un administrador la apruebe. El panel administrativo conserva la opción **Validar correo** para atender manualmente una cuenta cuando el usuario no recibe el mensaje.

La recuperación envía un enlace de un solo uso, válido por 30 minutos. Si el correo no está configurado o el proveedor rechaza el envío, la solicitud queda visible en **Administrar usuarios** y el administrador puede generar un código temporal. Al cambiar la contraseña se cierran todas las sesiones previas. Las respuestas de recuperación son deliberadamente genéricas para no revelar si un correo está registrado.

Configura `RESEND_API_KEY`, `AUTH_EMAIL_FROM` y `APP_PUBLIC_URL` en `.env.local`. `AUTH_EMAIL_FROM` debe usar un dominio verificado por Resend; `APP_PUBLIC_URL` debe ser la dirección pública HTTPS de la aplicación en producción. Las claves y los tokens se mantienen en el servidor y los tokens se almacenan únicamente como hashes.

### Firebase Authentication sin dominio propio

Cuando están configuradas las cuatro variables `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_EMAIL` y `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`, Firebase reemplaza el envío de Resend y la validación local de contraseñas. El registro, la verificación de correo y la recuperación utilizan las plantillas y el dominio administrado por Firebase. Mi Balance conserva una sesión HTTP-only propia después de validar las credenciales y mantiene en D1 los roles y la aprobación administrativa.

En Firebase Console habilita **Authentication → Sign-in method → Email/Password**. La clave web se obtiene en **Configuración del proyecto → General → Tus apps → SDK setup and configuration**. Crea una cuenta de servicio destinada a la aplicación y guarda su correo y clave privada únicamente como secretos del servidor. En `.env.local`, escribe la clave privada en una sola línea, reemplazando los saltos reales por `\n`; nunca uses variables `NEXT_PUBLIC_` para la cuenta de servicio.

Para evitar copiar manualmente la clave privada, después de descargar el JSON ejecuta `powershell -File scripts/configure-firebase.ps1 -ServiceAccountJson "C:\ruta\al\archivo.json"`. El script extrae `project_id`, `client_email` y `private_key`, los guarda en `.env.local` y no modifica el JSON original.

Las cuentas locales existentes se vinculan la primera vez que introducen correctamente su contraseña. Las cuentas activas conservan su correo validado; una cuenta pendiente recibe el correo de verificación de Firebase. Las cuentas deshabilitadas o rechazadas no se migran al intentar ingresar. Desde **Administrar usuarios**, validar correo sincroniza Firebase y D1, aprobar o deshabilitar sincroniza ambos estados, y generar recuperación devuelve un enlace temporal de Firebase para compartir por un canal seguro.

La migración `0008_cultured_old_lace.sql` agrega usuarios, sesiones, solicitudes de recuperación, límites de intentos y propiedad por usuario. `0009_email_activation.sql` incorpora la verificación de correo y `0010_firebase_auth.sql` enlaza cada cuenta local con su UID de Firebase. Pruebas: `node scripts/test-auth.mjs`, `node scripts/test-firebase-auth.mjs`, `node scripts/test-auth-mailer.mjs`, `node scripts/test-ledger.mjs` y `node scripts/test-coach.mjs`.

