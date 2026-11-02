import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export const nativeAndroidPush = Capacitor.getPlatform() === 'android' && !!import.meta.env?.VITE_ANDROID_PUSH_ENABLED;
let token;
let registration;

export async function enableAndroidPush(api, { sdk = PushNotifications, enabled = nativeAndroidPush, requestPermission = true } = {}) {
  if (!enabled) return 'skipped';
  const { result } = await api('android-push-config');
  if (!result?.enabled) return 'skipped';
  let permission = await sdk.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    if (!requestPermission) return 'skipped';
    permission = await sdk.requestPermissions();
  }
  if (permission.receive !== 'granted') return 'rejected';
  if (registration) return registration;
  registration = (async () => {
    await sdk.createChannel({ id:'honsulbar_service', name:'혼술바 알림', importance:3, visibility:0 });
    let timer;
    const handles = [];
    try {
      const pending = new Promise((resolve, reject) => {
        (async () => {
          handles.push(await sdk.addListener('registration', async event => {
            try { await api('android-push-register', { token:event.value }); token = event.value; resolve('agreed'); }
            catch (error) { reject(error); }
          }));
          handles.push(await sdk.addListener('registrationError', () => reject(new Error('알림 기기를 등록하지 못했어요.'))));
          timer = setTimeout(() => reject(new Error('알림 연결이 지연돼요. 다시 시도해 주세요.')), 20000);
          await sdk.register();
        })().catch(reject);
      });
      return await pending;
    } finally {
      clearTimeout(timer);
      await Promise.allSettled(handles.map(handle => handle.remove()));
    }
  })();
  try { return await registration; } finally { registration = null; }
}

export async function disableAndroidPush(api, { sdk = PushNotifications, enabled = nativeAndroidPush } = {}) {
  if (!enabled) return;
  if (token) await api('android-push-unregister', { token });
  await sdk.unregister();
  token = null;
}

export async function listenAndroidPush(onNotification, { sdk = PushNotifications, enabled = nativeAndroidPush } = {}) {
  if (!enabled) return () => {};
  const received = await sdk.addListener('pushNotificationReceived', () => onNotification(false));
  const opened = await sdk.addListener('pushNotificationActionPerformed', event => {
    if (['available','reply'].includes(event.notification?.data?.kind)) onNotification(true);
  });
  return () => { received.remove(); opened.remove(); };
}
