# Android: funciones compartidas y activación

La WebView usa la misma web HTTPS y cuenta: obligaciones, pagos, movimientos, reportes, gastos, metas, IA, supermercados, preferencias, bandeja con lectura/eliminación y privacidad de montos. Los cambios web requieren publicar el servidor; no se incorporan por compilar el APK.

La versión 1.2 añade push remoto mediante Expo/FCM, sonido balance_chime.wav y canal mi-balance-alerts-v2. Pulsar el aviso abre la bandeja. La frecuencia procede de las mismas preferencias del servidor y los mismos programadores, con sus límites; no garantiza intervalos exactos con el teléfono cerrado. Cerrar sesión revoca el envío; al renovar sesión se vincula de nuevo el dispositivo previamente activado.

## Pendiente de configuración

1. Registrar una aplicación Android en Firebase con paquete com.cristianhdez.mibalance.
2. Descargar google-services.json y ubicarlo en mobile/google-services.json, o establecer GOOGLE_SERVICES_JSON como variable de archivo de EAS. No usar la clave privada del servicio para este archivo.
3. En Expo/EAS, configurar las credenciales FCM V1 del proyecto 24eba997-66b7-4fca-9275-6716ae121f31. Mantener la clave privada fuera de Git. Si el proyecto Expo exige acceso autenticado al servicio push, configurar EXPO_ACCESS_TOKEN solo en el servidor.
4. Publicar el servidor con /api/native-push y el transporte Expo. No se necesita otra migración: las suscripciones nativas usan la misma tabla con un identificador expo: y su sesión autenticada.
5. Compilar desde mobile: npx eas-cli@latest build --profile preview --platform android. El directorio android generado está ignorado; EAS aplica los plugins y empaqueta el sonido.
6. Instalar el APK, iniciar sesión y activar avisos en Preferencias. Probar recepción con la app abierta/cerrada y tocar el aviso. Confirmar lectura, contador y eliminación, completar un pago y comprobar que no reaparece en el siguiente envío.

## Límites de verificación

El ticket de Expo confirma aceptación por el servicio, no presentación en el teléfono. Hace falta validar credenciales y recepción física; el procesamiento diferido de recibos de Expo no está implementado. Los fallos síncronos admiten los reintentos existentes y DeviceNotRegistered elimina la suscripción.

Dictado de voz: Android WebView puede no ofrecer SpeechRecognition. El formulario permite entrada de texto y dictado del teclado de Android; no se ha añadido un reconocedor de voz nativo propio.

No se han publicado cambios ni generado un APK de distribución con FCM sin configurar.
