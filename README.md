# Mi Balance

Plataforma multiusuario para controlar ingresos, obligaciones mensuales, pagos, gastos diarios y promociones cercanas en pesos colombianos. Utiliza Next.js estándar, Turso/libSQL y Firebase Authentication, y está preparada para desplegarse en Vercel.

## Arquitectura

- `src/domain`: entidades y cálculos financieros puros.
- `src/application`: casos de uso y validación de comandos.
- `src/infrastructure`: adaptadores de Turso, Firebase, Groq, correo y servicios de ubicación.
- `src/presentation`: interfaz React y formularios.
- `app/api`: rutas HTTP de Next.js con autenticación, autorización y validación de origen.
- `db/schema.ts` y `drizzle/`: esquema SQLite y migraciones versionadas.

El adaptador `src/infrastructure/database.ts` conserva la interfaz de consultas preparadas usada por los repositorios y la implementa con `@libsql/client`. Las operaciones agrupadas se envían a Turso mediante lotes transaccionales.

## Desarrollo local

Requiere Node.js 22.13 o posterior.

```sh
npm install
npm run db:migrate
npm run dev
```

La aplicación abre en `http://127.0.0.1:8787`. Para trabajar sin una base remota se puede usar:

```env
TURSO_DATABASE_URL=file:.local/mi-balance.db
TURSO_AUTH_TOKEN=
```

Para crear una compilación de producción:

```sh
npm run build
npm start
```

## Turso

Configura estas variables tanto en `.env.local` como en Vercel:

```env
TURSO_DATABASE_URL=libsql://tu-base.turso.io
TURSO_AUTH_TOKEN=tu-token
```

Después de configurar una base nueva, aplica todas las migraciones una sola vez:

```sh
npm run db:migrate
```

Para transferir los datos de la antigua base local de Cloudflare D1 a la base indicada por `TURSO_DATABASE_URL`:

```sh
npm run db:import:d1
```

El importador lee `.wrangler/state`, mantiene los identificadores y copia usuarios, obligaciones, movimientos, gastos, conversaciones, solicitudes y cachés. Se puede repetir: actualiza los registros existentes mediante su clave primaria.

## Despliegue en Vercel

1. Crea la base en Turso y genera un token.
2. Configura localmente las variables de Turso y ejecuta `npm run db:migrate`.
3. Ejecuta `npm run db:import:d1` si deseas conservar los datos locales existentes.
4. Sube el repositorio a GitHub e impórtalo en Vercel como proyecto Next.js.
5. Registra las variables de entorno en **Production**, **Preview** y **Development**, según corresponda.
6. Define `APP_PUBLIC_URL=https://tu-proyecto.vercel.app` y vuelve a desplegar.

Variables del servidor:

```env
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
ADMIN_BOOTSTRAP_TOKEN=
APP_PUBLIC_URL=https://tu-proyecto.vercel.app
FIREBASE_WEB_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_EMAIL=
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`RESEND_API_KEY` y `AUTH_EMAIL_FROM` son opcionales cuando Firebase gestiona verificación y recuperación. Ningún secreto usa el prefijo `NEXT_PUBLIC_`. `.env.local` está excluido de Git.

## Firebase Authentication

Habilita **Authentication → Sign-in method → Email/Password**. La aplicación usa Firebase para registro, verificación, acceso y recuperación; conserva en Turso los roles, la aprobación administrativa y las sesiones HTTP-only.

Para importar la cuenta de servicio desde el JSON descargado de Firebase:

```powershell
.\scripts\configure-firebase.ps1 -ServiceAccountJson "C:\ruta\firebase-adminsdk.json"
```

La cuenta de servicio permite que el administrador valide correos, habilite o deshabilite usuarios y genere enlaces de recuperación. La clave privada debe permanecer únicamente en `.env.local` y en los secretos de Vercel.

## Reglas principales

- Los importes se guardan como pesos enteros.
- Se admiten abonos parciales y reversión de pagos registrados por error.
- El servidor impide abonos superiores al saldo y cuotas inferiores a lo ya pagado.
- Los reportes distinguen pagos cumplidos, próximos a vencer y vencidos, y se recalculan después de cada movimiento.
- Las fechas, banco, enlace y tasas de una obligación se propagan a meses futuros; la cuota solo se propaga cuando el usuario marca la opción correspondiente.
- Cada consulta filtra por usuario. Las cuentas nuevas no heredan los datos de otras cuentas.
- La IA no puede crear, modificar ni reversar movimientos financieros.

## Asistente y promociones

El asistente usa Groq. Solo envía el resumen financiero cuando el usuario activa **Incluir mi resumen**; omite números de cuenta, enlaces bancarios, notas y descripciones individuales de gastos.

La sección de promociones usa OpenStreetMap para localizar comercios y Groq para consultar ofertas públicas. La ubicación elegida queda en el navegador; Groq recibe únicamente nombres públicos de comercios. Los resultados se guardan por un día en Turso.

## Validación

```sh
npx tsc --noEmit
npm run build
node scripts/test-ledger.mjs
node scripts/test-coach.mjs
node scripts/test-promotions.mjs
node scripts/test-auth.mjs
node scripts/test-firebase-auth.mjs
node scripts/test-auth-mailer.mjs
node scripts/test-request-origin.mjs
```
