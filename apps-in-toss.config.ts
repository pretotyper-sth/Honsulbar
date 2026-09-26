import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'honsulbar',
  brand: {
    primaryColor: '#3182f6',
  },
  permissions: [
    { name: 'camera', access: 'access' },
    { name: 'microphone', access: 'access' },
  ],
  navigationBar: {
    transparentBackground: true,
  },
  webView: {
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
  },
  webBundleDir: 'dist',
});
