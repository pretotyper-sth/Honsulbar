import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { androidBuildConfig } from './scripts/android-build-config.js';

// Explicit settings only: never inherit production server secrets from .env files.
export default defineConfig(() => {
  const config = androidBuildConfig();
  if (config.define['import.meta.env.VITE_FLOW_MOCK'] !== 'true') return config;
  return { ...config, plugins: [{
    name: 'flow-mock-local-assets',
    generateBundle() {
      for (const name of ['pglite.wasm', 'initdb.wasm', 'pglite.data']) {
        this.emitFile({type:'asset',fileName:'flow-mock/'+name,source:readFileSync(new URL('./node_modules/@electric-sql/pglite/dist/'+name,import.meta.url))});
      }
      for (const name of ['1.jpg','2.jpg','3.jpg','4.jpg']) {
        this.emitFile({type:'asset',fileName:'flow-mock/'+name,source:readFileSync(new URL('./scripts/local-guests/'+name,import.meta.url))});
      }
    },
  }] };
});
