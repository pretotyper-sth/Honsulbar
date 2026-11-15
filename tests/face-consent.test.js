import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformWithEsbuild} from 'vite';

const source=readFileSync(new URL('../src/ui.jsx',import.meta.url),'utf8');
const component=source.slice(source.indexOf('export function FaceCaptureNotice('),source.indexOf('export function CameraVerificationStatus')).replaceAll('export ','');
const {code}=await transformWithEsbuild(component,'face-capture-consent.jsx',{loader:'jsx',jsx:'transform'});

test('the camera presents a single affirmative action with the processing notice on the same screen',()=>{
 for(const retry of [false,true]){
  let captures=0;
  const env={React:{useId:()=> 'notice',Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children})},Button:'Button'};
  vm.createContext(env);
  vm.runInContext(code,env);
  const notice=env.FaceCaptureNotice();
  const button=env.FaceCaptureConsent({retry,onCapture:()=>captures++});
  assert.match(notice.children[0],/촬영본과 얼굴 비교 정보.*사용하고.*삭제/);
  assert.equal(button.type,'Button');
  assert.equal(button.props['aria-describedby'],notice.props.id);
  assert.equal(button.children[0],retry?'동의하고 다시 촬영하기':'동의하고 촬영하기');
  assert.equal(captures,0);
  button.props.onClick();
  assert.equal(captures,1);
 }
});
