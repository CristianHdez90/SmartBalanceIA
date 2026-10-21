import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { APP_URL, isAppUrl, isExternalUrl, parseExport } from './src/policy';

import * as Notifications from 'expo-notifications';
import { handleReminderMessage } from './src/notifications';

const REMINDER_READY = "window.miBalanceReminders=1;window.dispatchEvent(new Event('mi-balance-reminders-ready'));true;";
const LOCK_KEY = 'mi-balance-device-lock';
export default function App() {
  const web = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false), [locked, setLocked] = useState(true), [lockEnabled, setLockEnabled] = useState(false);
  const [inactive, setInactive] = useState(false), [error, setError] = useState(false), [loading, setLoading] = useState(true), [canGoBack, setCanGoBack] = useState(false);
  const busy = useRef(false), alive = useRef(true);
  const currentUrl = useRef(APP_URL);
  const pendingReminder = useRef(false);
  const webReady = useRef(false);
  const openReminder = useCallback(() => {
    if (webReady.current && isAppUrl(currentUrl.current) && !locked) {
      web.current?.injectJavaScript("window.miBalanceOpenReminders=true;window.dispatchEvent(new Event('mi-balance-open-reminders'));true;");
      pendingReminder.current = false;
    }
  }, [locked]);
  useEffect(() => {
    const response = Notifications.getLastNotificationResponse();
    if (response?.notification.request.content.data?.section === 'reminders') { pendingReminder.current = true; Notifications.clearLastNotificationResponse(); }
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.notification.request.content.data?.section === 'reminders') { pendingReminder.current = true; Notifications.clearLastNotificationResponse(); openReminder(); }
    });
    if (pendingReminder.current) openReminder();
    return () => sub.remove();
  }, [openReminder]);
  async function onMessage(event: WebViewMessageEvent) {
    if (!isAppUrl(event.nativeEvent.url) || !isAppUrl(currentUrl.current)) return;
    let type: string;
    try { type = JSON.parse(event.nativeEvent.data).type; } catch { return; }
    if (type !== 'mi-balance-reminders') { await exportFile(event); return; }
    try {
      const result = await handleReminderMessage(event.nativeEvent.data);
      if (isAppUrl(currentUrl.current)) web.current?.injectJavaScript('window.dispatchEvent(new CustomEvent("mi-balance-reminders-result",{detail:' + JSON.stringify(result) + '}));true;');
    } catch { /* Malformed or oversized bridge messages are ignored. */ }
  }
  useEffect(() => {
    alive.current = true;
    SecureStore.getItemAsync(LOCK_KEY).then(value => { if (alive.current) { setLockEnabled(value === 'true'); setLocked(value === 'true'); setReady(true); } }).catch(() => { if (alive.current) { setLocked(true); setReady(true); } });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setInactive(state !== 'active');
      if (state === 'active' && isAppUrl(currentUrl.current)) web.current?.injectJavaScript(REMINDER_READY);
      if (state === 'background' && lockEnabled) setLocked(true);
    });
    return () => subscription.remove();
  }, [lockEnabled]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return false;
      if (canGoBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, locked]);
  async function authenticate() {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear Mi Balance', cancelLabel: 'Cancelar', fallbackLabel: 'Usar código del dispositivo' });
      return result.success;
    } catch { Alert.alert('No se pudo desbloquear', 'Configura el bloqueo del dispositivo e inténtalo nuevamente.'); return false; }
  }
  async function toggleLock() {
    if (!lockEnabled && !(await LocalAuthentication.isEnrolledAsync())) { Alert.alert('Configura tu huella o rostro', 'Activa primero la autenticación biométrica en los ajustes del teléfono.'); return; }
    if (!(await authenticate())) return;
    try { await SecureStore.setItemAsync(LOCK_KEY, String(!lockEnabled)); setLockEnabled(!lockEnabled); }
    catch { Alert.alert('No se guardó el cambio', 'Vuelve a intentarlo.'); }
  }
  async function openExternal(url: string) {
    if (!isExternalUrl(url)) return;
    if (url.startsWith('https:')) { try { await WebBrowser.openBrowserAsync(url); } catch { Alert.alert('No se pudo abrir el enlace'); } }
    else { const { Linking } = await import('react-native'); try { await Linking.openURL(url); } catch { Alert.alert('No hay una aplicación para este enlace'); } }
  }
  async function exportFile(event: WebViewMessageEvent) {
    if (!isAppUrl(event.nativeEvent.url) || !isAppUrl(currentUrl.current) || busy.current || locked) return;
    let file: ReturnType<typeof parseExport>;
    try { file = parseExport(event.nativeEvent.data); } catch { return; }
    busy.current = true;
    let failure: string | undefined, path: string | undefined;
    try {
      if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) throw new Error('No está disponible la opción de compartir archivos.');
      path = FileSystem.cacheDirectory + file.id + '-' + file.filename;
      await FileSystem.writeAsStringAsync(path, file.base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(path, { mimeType: file.mimeType, dialogTitle: 'Guardar o compartir respaldo' });
    } catch { failure = 'No se pudo compartir el archivo. Inténtalo nuevamente.'; }
    finally {
      if (path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      if (isAppUrl(currentUrl.current)) web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('mi-balance-export-result',{detail:${JSON.stringify({ id: file.id, error: failure })}}));true;`);
      busy.current = false;
    }
  }
  return <SafeAreaProvider><SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}><StatusBar style="light"/>
    <View style={styles.toolbar}><Text style={styles.brand}>Mi Balance IA</Text><Pressable accessibilityRole="button" accessibilityLabel={lockEnabled ? 'Desactivar bloqueo biométrico' : 'Activar bloqueo biométrico'} disabled={locked || !ready} onPress={() => void toggleLock()} style={styles.control}><Text style={styles.controlText}>{lockEnabled ? '🔒' : '🔓'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Recargar aplicación" disabled={locked || !ready} onPress={() => { setError(false); web.current?.reload(); }} style={styles.control}><Text style={styles.controlText}>↻</Text></Pressable></View>
    {ready && <WebView<object> injectedJavaScriptBeforeContentLoaded={REMINDER_READY} ref={web} source={{ uri: APP_URL }} style={styles.web} originWhitelist={['https://*','mailto:*','tel:*']} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false} mixedContentMode="never" allowsBackForwardNavigationGestures allowsInlineMediaPlayback={false} geolocationEnabled setSupportMultipleWindows onOpenWindow={event => void openExternal(event.nativeEvent.targetUrl)} onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank') return true;
      if (isAppUrl(request.url)) return true;
      void openExternal(request.url); return false;
    }} onNavigationStateChange={state => { currentUrl.current = state.url; setCanGoBack(state.canGoBack); }} onLoadStart={() => { webReady.current = false; setLoading(true); }} onLoadEnd={() => { webReady.current = true; setLoading(false); if (isAppUrl(currentUrl.current)) { web.current?.injectJavaScript(REMINDER_READY); if (pendingReminder.current) openReminder(); } }} onError={() => { setError(true); setLoading(false); }} onHttpError={event => { if (event.nativeEvent.statusCode >= 500 && event.nativeEvent.url === currentUrl.current) setError(true); }} onContentProcessDidTerminate={() => { setError(true); setLoading(false); }} onRenderProcessGone={() => { setError(true); setLoading(false); }} onMessage={event => void onMessage(event)} />}
    {loading && !error && !locked && <View pointerEvents="none" style={styles.progress}><ActivityIndicator color="#a5b4fc"/></View>}
    {error && !locked && <View style={styles.overlay}><Text style={styles.symbol}>☁</Text><Text style={styles.title}>No se pudo conectar</Text><Text style={styles.description}>Mi Balance necesita conexión para consultar y guardar tus datos. Revisa tu internet e inténtalo nuevamente.</Text><Pressable style={styles.button} onPress={() => { setError(false); setLoading(true); web.current?.reload(); }}><Text style={styles.buttonText}>Reintentar</Text></Pressable></View>}
    {(!ready || locked || inactive) && <View style={styles.overlay}><Text style={styles.symbol}>🔒</Text><Text style={styles.title}>Mi Balance IA</Text><Text style={styles.description}>Tu información financiera, privada y organizada.</Text>{ready && locked && !inactive ? <Pressable style={styles.button} onPress={async () => { if (await authenticate()) setLocked(false); }}><Text style={styles.buttonText}>Desbloquear</Text></Pressable> : !ready ? <ActivityIndicator color="#a5b4fc"/> : null}</View>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#07091a' }, web: { flex: 1, backgroundColor: '#07091a' }, toolbar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#252b50' }, brand: { flex: 1, fontWeight: '700', fontSize: 16, color: '#f0f4ff' }, control: { padding: 10, minWidth: 44, alignItems: 'center' }, controlText: { fontSize: 23, color: '#a5b4fc' }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#07091a', alignItems: 'center', justifyContent: 'center', padding: 28 }, symbol: { fontSize: 42, marginBottom: 20 }, title: { color: '#f0f4ff', fontSize: 24, fontWeight: '700', marginBottom: 12 }, description: { color: '#aab8d5', textAlign: 'center', lineHeight: 24, marginBottom: 24, maxWidth: 350 }, button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, minWidth: 160, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' }, progress: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 50, right: 16 } });
