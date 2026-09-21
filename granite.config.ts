import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'yeopjari',
  brand: {
    displayName: '혼술바 - 옆자리',
    primaryColor: '#3182f6',
    icon: process.env.TOSS_BRAND_ICON || '',
  },
  web: {
    host: process.env.TOSS_DEV_HOST || 'localhost',
    port: 5173,
    commands: { dev: 'npm run dev', build: 'npm run build' },
  },
  permissions: [],
  outdir: 'dist',
});
