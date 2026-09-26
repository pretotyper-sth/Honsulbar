import { defineConfig } from 'vite';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

export default defineConfig({
  plugins: [aitDevtools.vite()],
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  preview: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
