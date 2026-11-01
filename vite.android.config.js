import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Local test APK only; do not load production or Toss settings from .env files.
export default defineConfig({
  envDir: '.android-test-env-unused',
  // Only explicit public Auth configuration is included; local test remains the default.

  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('http://localhost:3001'),
    'import.meta.env.VITE_ANDROID_TEST': 'true',
    'import.meta.env.VITE_SOCIAL_LOGIN_ENABLED': JSON.stringify(process.env.HB_SOCIAL_LOGIN_ENABLED === '1'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.HB_AUTH_PUBLIC_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.HB_AUTH_PUBLIC_KEY || ''),
  },
  resolve: { alias: { '@apps-in-toss/web-framework': fileURLToPath(new URL('./src/android-test-platform.js', import.meta.url)) } },
  build: { outDir: 'dist-android' },
});
