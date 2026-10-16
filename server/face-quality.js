export const FACE_RULES = Object.freeze({boxScore:0.8,meshScore:0.9,similarity:0.62,live:0.5,minSize:0.2,maxYaw:0.4,maxPitch:0.4});
const finitePoint = p => Array.isArray(p) && p.length>=2 && p.every(Number.isFinite);
const overlap = (a,b) => Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
function patch(image,cx,cy,w,h){
 let sum=0,sq=0,edge=0,n=0;
 const gray=(x,y)=>{const i=(y*image.width+x)*4;return image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114;};
 for(let y=Math.max(1,Math.floor(cy-h/2));y<Math.min(image.height-1,cy+h/2);y++)for(let x=Math.max(1,Math.floor(cx-w/2));x<Math.min(image.width-1,cx+w/2);x++){
  const v=gray(x,y);sum+=v;sq+=v*v;edge+=Math.abs(v-gray(x+1,y))+Math.abs(v-gray(x,y+1));n++;
 }
 return {mean:sum/n,std:Math.sqrt(Math.max(0,sq/n-(sum/n)**2)),edge:edge/n,n};
}
export function faceQualityError(result,image,{capture=false}={}){
 if(!Array.isArray(result?.face)||result.face.length===0)return '얼굴을 찾지 못했어요. 밝은 곳에서 촬영해 주세요.';
 if(result.face.length!==1)return '여러 얼굴이 보여요. 혼자 촬영해 주세요.';
 const face=result.face[0],box=face.box;
 if(!box||box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0)return '얼굴 전체가 보이게 촬영해 주세요.';
 if(!(face.boxScore>=FACE_RULES.boxScore&&face.faceScore>=FACE_RULES.meshScore)||!Array.isArray(face.mesh)||face.mesh.length<468)return '눈·코·입이 모두 보이게 촬영해 주세요.';
 const [x,y,w,h]=box;
 if(Math.min(w/image.width,h/image.height)<FACE_RULES.minSize||Math.min(w,h)<64)return '얼굴을 조금 더 가까이 보여 주세요.';
 const outline=[10,152,234,454].map(i=>face.mesh[i]);
 if(!outline.every(finitePoint)||outline.some(p=>p[0]<2||p[1]<2||p[0]>=image.width-2||p[1]>=image.height-2))return '얼굴 전체를 화면 안에 맞춰 주세요.';
 const points=[33,133,362,263,1,61,291,13].map(i=>face.mesh[i]);
 if(!points.every(finitePoint)||points.some(p=>p[0]<1||p[1]<1||p[0]>=image.width-1||p[1]>=image.height-1))return '눈·코·입이 모두 보이게 촬영해 주세요.';
 const angle=face.rotation?.angle;
 if(!angle||!Number.isFinite(angle.yaw)||!Number.isFinite(angle.pitch)||Math.abs(angle.yaw)>FACE_RULES.maxYaw||Math.abs(angle.pitch)>FACE_RULES.maxPitch)return '고개를 바로 하고 화면을 봐 주세요.';
 for(const hand of result.hand||[]){
  if(hand.label==='face'||!(hand.score>=.65)||!hand.box?.every(Number.isFinite))continue;
  const inner=[x+w*.12,y+h*.12,w*.76,h*.76];
  if(overlap(inner,hand.box)/(inner[2]*inner[3])>.035)return '얼굴 앞의 손을 내려 주세요.';
 }
 const regions=[[points[0],points[1]],[points[2],points[3]],[points[5],points[6]]];
 for(const [a,b] of regions){
  const stats=patch(image,(a[0]+b[0])/2,(a[1]+b[1])/2,Math.max(12,Math.abs(b[0]-a[0])*1.15),h*.13);
  if(stats.n<24||!Number.isFinite(stats.std)||stats.mean<22||stats.mean>240||stats.std<9||stats.edge<2.2)return '가린 곳 없이 밝고 선명하게 촬영해 주세요.';
 }
 if(capture&&(!Number.isFinite(face.live)||face.live<FACE_RULES.live))return '실제 얼굴을 카메라로 다시 촬영해 주세요.';
 if(!Array.isArray(face.embedding)||face.embedding.length!==1024||!face.embedding.every(Number.isFinite)||!face.embedding.some(v=>v!==0))return '얼굴을 확인하지 못했어요. 다시 촬영해 주세요.';
 return null;
}
export function comparisonError(results,similarity,motion){
 if(results.length!==3||!['near','far'].includes(motion))return '얼굴 확인을 다시 시작해 주세요.';
 const [photo,first,last]=results;
 for(const [a,b] of [[photo,first],[photo,last],[first,last]]){
  const score=similarity(a.embedding,b.embedding);
  if(!Number.isFinite(score)||score<FACE_RULES.similarity)return '사진과 얼굴이 달라요. 본인 사진을 사용해 주세요.';
 }
 const ratio=last.scale/first.scale;
 if(!Number.isFinite(ratio)||(motion==='near'?ratio<1.12||ratio>1.9:ratio>.89||ratio<.53))return '안내에 따라 휴대폰을 움직여 주세요.';
 return null;
}
