import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'honsulbar',
  brand: {
    primaryColor: '#3182f6',
  },
  permissions: [],
  navigationBar: {
    transparentBackground: true,
    theme: 'dark',
  },
  webView: {
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
  },
  webBundleDir: 'dist',
});
