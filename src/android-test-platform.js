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
// TDS visual provider reads these synchronously; standalone insets are owned by the Android WebView.
export const getSafeAreaInsets = () => ({top:0,right:0,bottom:0,left:0});
export const getAppsInTossGlobals = () => ({brandPrimaryColor:'#3182f6'});
