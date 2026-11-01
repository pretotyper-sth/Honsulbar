// Keep Toss bridges out of the standalone test APK. Real native integrations remain separate work.
const unsupported = () => { throw new Error('Standalone test build: Toss bridge unavailable'); };
unsupported.isSupported = () => false;
export const appLogin = unsupported;
export const requestNotificationAgreement = unsupported;
export const loadFullScreenAd = unsupported;
export const showFullScreenAd = unsupported;
export const IAP = {};
export const SafeAreaInsets = {};
export const NavigationBar = {};
