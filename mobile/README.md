# Mi Balance IA para Android e iOS

Aplicación Expo / React Native que conserva el sistema existente dentro de una WebView HTTPS. Se conecta a `https://smart-balance-ia.vercel.app/` y utiliza las mismas cuentas y base de datos. Necesita conexión; no guarda operaciones financieras sin conexión.

Incluye bloqueo biométrico opcional (candado superior), cobertura de privacidad al pasar a segundo plano, navegación atrás de Android, apertura de enlaces externos y exportación SQL/CSV/Excel mediante el menú nativo de compartir. El puente sólo acepta mensajes del dominio de producción y nombres de respaldo válidos, con límite de 8 MB desde la web.

## Desarrollo y comprobaciones

Requiere Node 22.13 o posterior. Ejecutar dentro de esta carpeta:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npx expo-doctor
npm run bundle
```

`bundle` valida JavaScript para Android e iOS; **no produce un APK ni un IPA**. Para ejecutar con módulos nativos usar una development build, no depender de Expo Go:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
npm start
```

El proyecto usa generación nativa automática. `npx expo prebuild --no-install --platform android` genera Android. EAS genera iOS en macOS en la nube; la compilación local de iOS requiere Mac/Xcode. No editar los directorios generados: cambiar `app.json` y plugins.

## Instaladores y tiendas

Las cuentas de Google Play y Apple Developer ya fueron confirmadas por el propietario. Proyecto vinculado a `@cristiandevhdezs-team/smartbalanceia` (ID `24eba997-66b7-4fca-9275-6716ae121f31`). La sesión de EAS fue verificada y la clave Android fue creada en Expo. No guardar contraseñas, claves o certificados en Git.

El identificador inicial de ambas plataformas es `com.cristianhdez.mibalance`; confirmar su disponibilidad y titularidad antes del primer envío. El identificador real del proyecto Expo ya está configurado en `app.json`.

```powershell
# APK para probar directamente en un Android
npx eas-cli@latest build --profile preview --platform android
# AAB para Google Play e IPA para App Store Connect/TestFlight
npx eas-cli@latest build --profile production --platform all
# Después de probar los binarios y configurar las fichas de las tiendas:
npx eas-cli@latest submit --profile production --platform android
npx eas-cli@latest submit --profile production --platform ios
```

EAS solicitará las credenciales de firma y los identificadores de las fichas. No se han generado binarios firmados ni enviado versiones a las tiendas.

## Antes de distribución pública

- Publicar los cambios web de `src/presentation/download-file.ts` y `monthly-backup.tsx` para habilitar las exportaciones nativas en el dominio de producción.
- Probar en Android y iPhone reales: inicio/cierre de sesión, filtros, hamburguesa, teclado, rotación, navegación atrás, bloqueo y recuperación con código del dispositivo, pérdida de red, permisos de ubicación y apertura de enlaces.
- Exportar y compartir los tres formatos; restaurar SQL con una cuenta de prueba y verificar mes, módulo y aislamiento de cuentas. No probar restauraciones sobre información real.
- El dictado web depende del soporte de Web Speech del dispositivo. Donde no esté disponible, usar el dictado del teclado; no se añadió reconocimiento de voz nativo.
- Completar privacidad, soporte, declaraciones de datos y eliminación de cuenta, capturas de pantalla y acceso de revisión. Verificar los flujos de eliminación de cuenta antes del envío público.
- La aceptación de la aplicación híbrida depende de la revisión de cada tienda; no está garantizada por generar un binario.

## Dependencias

Se aplicaron las correcciones compatibles de `npm audit fix`. Al 20 de octubre de 2026 quedan avisos transitivos en `braces`, `node-forge` y `uuid`, propagados por herramientas de Expo/Metro. No aplicar `npm audit fix --force`: propone retroceder a SDK incompatibles. Revisar las correcciones del proveedor antes del lanzamiento y repetir auditoría y pruebas al actualizar.

### Compatibilidad del lockfile con EAS

El 20 de octubre se reprodujo con npm 10 el fallo de EAS por los peers `@emnapi/core` y `@emnapi/runtime` ausentes. npm 11 no detectaba esa inconsistencia. El lockfile se reparó con npm 10 en una carpeta sin `node_modules`. Para actualizarlo, usar `npm exec --yes --package=npm@10 -- npm install --package-lock-only --include=dev --include=optional` y verificar con `npm exec --yes --package=npm@10 -- npm ci --include=dev` antes de enviar otra compilación.

## Recordatorios de pagos y promociones (1.1.0)

La sección Notificaciones permite registrar supermercado (con sugerencias Supermu, Éxito y Olímpica), producto, días semanales, vigencia, condiciones y pausas. No se cargan ofertas ficticias. Los registros y preferencias están aislados por cuenta en Turso (migración 0014).

Valores iniciales: 3 días antes y el día del vencimiento a las 08:00 America/Bogota. Las obligaciones vencidas siguen generando un resumen diario mientras tengan saldo pendiente. Las promociones vigentes se incluyen el mismo día. Se puede cambiar hora, anticipación y activar/desactivar cada grupo.

Instalar el APK 1.1.0, entrar a Notificaciones y pulsar Activar notificaciones; aceptar el permiso del sistema. Probar aviso programa un mensaje 5 segundos después. No se muestran montos, productos ni nombres de obligaciones en la pantalla bloqueada. Al tocar un aviso se abre Notificaciones.

Son recordatorios locales programados, no push desde un servidor: funcionan después de cerrar la app, con las limitaciones del sistema operativo. Se sincronizan al abrir/retomar la app, cada 5 minutos mientras está visible y al modificar datos. Se programa como máximo un resumen por día para 30 días. Los pagos realizados en otro dispositivo requieren volver a abrir esta app para cancelar avisos anteriores. Sólo se consideran obligaciones ya existentes en la base. No se crean meses financieros nuevos automáticamente. Al cerrar sesión o cambiar de cuenta se eliminan los avisos del usuario anterior. Las reinstalaciones y cambios de permisos requieren activación/sincronización nuevamente.

La web permite administrar el calendario pero esta entrega no incluye Web Push de Safari/Chrome; los avisos del dispositivo requieren el contenedor nativo actualizado. iOS incluye el código, pero su instalador sigue pendiente de la membresía de Apple.

Validación: pruebas unitarias del calendario, zona horaria, pagos/traslados y vigencia; integración SQLite de aislamiento y concurrencia; simulación del módulo nativo para duplicados/permisos/cierre de sesión; pruebas del puente nativo; tipos, lint y bundles Android/iOS; compilación Next. La comprobación visual fue bloqueada por la política del navegador de la sesión. Falta comprobar entrega de avisos en un teléfono real y después de reiniciar el dispositivo.
