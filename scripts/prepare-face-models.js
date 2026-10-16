import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const root=dirname(dirname(require.resolve('@vladmandic/human')));
const models=new URL('../server/face-models/',import.meta.url),vendor=new URL('../server/vendor/',import.meta.url);
await mkdir(models,{recursive:true});await mkdir(vendor,{recursive:true});
for(const name of ['blazeface','faceres','liveness','facemesh','handtrack','handlandmark-lite'])for(const extension of ['json','bin'])await copyFile(join(root,'models',`${name}.${extension}`),new URL(`${name}.${extension}`,models));
const code=(await readFile(join(root,'dist/human.node.js'),'utf8')).replace('require("@tensorflow/tfjs-node")','Object.assign(require("@tensorflow/tfjs"),require("@tensorflow/tfjs-backend-wasm"))');
await writeFile(new URL('human-cpu.cjs',vendor),code);
await copyFile(join(root,'LICENSE'),new URL('HUMAN-LICENSE',vendor));

const wasmRoot=dirname(require.resolve('@tensorflow/tfjs-backend-wasm'));
for(const name of ['tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'])await copyFile(join(wasmRoot,name),new URL(name,vendor));
