import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformWithEsbuild} from 'vite';
const source=readFileSync(new URL('../src/ui.jsx',import.meta.url),'utf8');
const component=source.slice(source.indexOf('export function FaceConsent('),source.indexOf('export function CameraVerificationStatus')).replace('export ','');
async function render(checked=false){
 const calls=[],changes=[];
 const dialog={showModal:()=>calls.push('open'),close:()=>calls.push('close')};
 const env={React:{useRef:()=>({current:dialog}),useId:()=> 'id',Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children})},Button:'Button'};
 vm.createContext(env);vm.runInContext((await transformWithEsbuild(component,'face-consent.jsx',{loader:'jsx',jsx:'transform'})).code,env);
 const tree=env.FaceConsent({checked,onChange:value=>changes.push(value)});
 const nodes=[];function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);node.children?.forEach(walk);}walk(tree);
 return {calls,changes,nodes};
}
test('face consent opens only on request and confirmation completes the single checkbox',async()=>{
 const {calls,changes,nodes}=await render();
 assert.deepEqual(calls,[]);
 const inputs=nodes.filter(node=>node.type==='input');assert.equal(inputs.length,1);
 inputs[0].props.onChange();assert.deepEqual(calls,['open']);assert.deepEqual(changes,[]);
 nodes.find(node=>node.type==='Button'&&node.children.includes('나중에')).props.onClick();
 assert.deepEqual(changes,[]);
 nodes.find(node=>node.type==='Button'&&node.children.includes('동의하기')).props.onClick();
 assert.deepEqual(changes,[true]);assert.equal(calls.at(-1),'close');
});
test('unchecking existing consent revokes it without opening the modal',async()=>{
 const {calls,changes,nodes}=await render(true);
 nodes.find(node=>node.type==='input').props.onChange();
 assert.deepEqual(changes,[false]);assert.deepEqual(calls,[]);
 assert.ok(!nodes.some(node=>node.type==='Button'&&node.children.includes('동의하기')));
});
