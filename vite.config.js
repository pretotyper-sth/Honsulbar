import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
import {tossPublicAssets} from './scripts/toss-bundle-policy.js';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

export default defineConfig(({mode}) => {
 const toss=mode==='toss';
 return {
  publicDir:toss?false:'public',
  build:{outDir:toss?'dist-toss':'dist'},
  resolve:{alias:toss?[{find:/^\.\/AccountTransferCode$/,replacement:fileURLToPath(new URL('./src/toss/AccountTransferCode.jsx',import.meta.url))}]:[]},
  plugins: [aitDevtools.vite({ panel: process.env.AIT_DEVTOOLS === '1' }), ...(toss?[{
    name:'toss-public-assets',
    generateBundle(){for(const file of tossPublicAssets(fileURLToPath(new URL('./public/',import.meta.url))))this.emitFile({type:'asset',fileName:file.name,source:file.source});},
  }]:[])],
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  preview: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
 };
});
