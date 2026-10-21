import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility, IosAuthorizationStatus } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { parseReminderMessage } from './reminder-policy';

const KEY = 'mi-balance-reminders-owner', CHANNEL = 'mi-balance-reminders';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
let queue = Promise.resolve();
async function cancel() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of pending) if (item.identifier.startsWith('balance-')) await Notifications.cancelScheduledNotificationAsync(item.identifier);
  await Notifications.dismissAllNotificationsAsync();
  Notifications.clearLastNotificationResponse();
}
export function handleReminderMessage(raw: string): Promise<{ id: string; enabled: boolean; count: number; error?: string }> {
  const request = parseReminderMessage(raw);
  const work = queue.then(async () => {
    try {
      if (request.action === 'clear' || request.action === 'disable') { await SecureStore.deleteItemAsync(KEY); await cancel(); return { id: request.id, enabled: false, count: 0 }; }
      let owner = await SecureStore.getItemAsync(KEY);
      if (owner && owner !== request.userId) { await SecureStore.deleteItemAsync(KEY); await cancel(); owner = null; }
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Pagos y promociones', importance: AndroidImportance.DEFAULT, lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, sound: 'default' });
      let permission = await Notifications.getPermissionsAsync();
      if (request.action === 'enable') permission = await Notifications.requestPermissionsAsync();
      const allowed = permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
      if (!allowed) {
        await cancel(); await SecureStore.deleteItemAsync(KEY);
        if (request.action === 'enable' || request.action === 'test') throw new Error('Permite las notificaciones de Mi Balance en los ajustes del teléfono y vuelve a activarlas.');
        return { id: request.id, enabled: false, count: 0 };
      }
      if (request.action === 'enable') { await SecureStore.setItemAsync(KEY, request.userId); owner = request.userId; }
      if (owner !== request.userId) return { id: request.id, enabled: false, count: 0 };
      await cancel();
      let count = 0;
      for (const item of request.plan) {
        if (item.at <= Date.now() + 1000) continue;
        await Notifications.scheduleNotificationAsync({ identifier: item.id, content: { title: item.title, body: item.body, sound: 'default', data: { section: 'reminders' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.at), channelId: CHANNEL } });
        count++;
      }
      if (request.action === 'test') await Notifications.scheduleNotificationAsync({ identifier: 'balance-test', content: { title: 'Mi Balance IA', body: 'Los avisos están activos en este dispositivo.', sound: 'default', data: { section: 'reminders' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 5000), channelId: CHANNEL } });
      return { id: request.id, enabled: true, count };
    } catch (e) {
      await cancel().catch(() => {});
      return { id: request.id, enabled: false, count: 0, error: e instanceof Error ? e.message : 'No se pudieron programar los avisos.' };
    }
  });
  queue = work.then(() => {}, () => {});
  return work;
}
