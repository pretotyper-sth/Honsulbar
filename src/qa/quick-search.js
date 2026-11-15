import { CAPACITY, DRINKS } from '../model';
import photo1 from '../../scripts/local-guests/1.jpg?inline';
import photo2 from '../../scripts/local-guests/2.jpg?inline';
import photo3 from '../../scripts/local-guests/3.jpg?inline';
import photo4 from '../../scripts/local-guests/4.jpg?inline';

const photos = [photo1, photo2, photo3, photo4];
const room = (number, count, region = '서울', hasReportedGuest = false) => ({region, number, count, hasReportedGuest});
const makeGuest = (seat, index = 0) => ({
  id:`qa-guest-${index}`, nickname:`${['느긋한 토끼','포근한 구름','조용한 여우','반짝이는 달'][index % 4]}${index >= 4 ? index+1 : ''}`,
  gender:index % 2 ? 'female' : 'male', photo:photos[index % photos.length], seat,
  drinkId:DRINKS[index % DRINKS.length].id, seconds:1800 - 32 * index, mic:index % 2 === 0,
});
const quickGuest = makeGuest(1);
const scenarios = [
  ['입장과 매칭', [
    ['one','서울 1곳'], ['many','서울 5곳'], ['fallback','다른 지역만'], ['filtered','만석 표시·제한 숨김'], ['vacancy','빈자리 알림'],
    ['empty','빈 방 대기'], ['match','자동 매칭'], ['decline','상대가 거절'], ['expired','시간 초과'],
    ['unverified','프로필 미등록'], ['visit-expired','이용시간 초과'], ['paused','안전 점검'], ['bar-rejoin','남은 시간으로 재입장'],
    ['bar-camera','촬영 가이드','내 프로필 → 얼굴 확인하기'],
  ]],
  ['바 화면과 이용 시간', [
    ['bar-third','기본 3D·옷 색·소리 방향'], ['bar-first','1인칭'], ['bar-flat','2D'], ['bar-full','12석 만석'],
    ['bar-remote-facing','다른 손님 의자 회전·퇴장'], ['bar-solo','혼자 대기 · 30:00'], ['bar-arrival','5초 뒤 손님 입장'], ['bar-departure','5초 뒤 손님 퇴장'],
    ['bar-low','5분 미만 경고'], ['bar-ended','이용 시간 종료'], ['bar-order','한 잔 더 주문'], ['bar-held-drink','손에 든 잔 · 잔량과 이동'],
    ['bar-host','사장 자리 · 시간 제한 없음'],
  ]],
  ['자리 이동과 맞교환', [
    ['bar-move','빈자리 이동·내 발소리'], ['bar-move-near','옆자리 인사 후 이동'], ['bar-move-host','사장 자리로 이동'],
    ['bar-move-fail','이동 실패 후 원래 자리'], ['bar-guest-move','다른 손님 둘이 동시에 이동'],
    ['bar-swap-near','가까운 자리 맞교환'], ['bar-swap-far','먼 자리 맞교환'], ['bar-swap-host','사장 자리 맞교환'],
    ['bar-swap-first','1인칭에서 맞교환'], ['bar-swap-wait','내가 먼저 비켜서 기다리기'], ['bar-swap-decline','받은 맞교환 거절'],
    ['bar-swap-out','보낸 요청을 상대가 수락','4번 손님 프로필에서 자리 양보를 부탁해 보세요.'],
    ['bar-swap-no','보낸 요청을 상대가 거절','4번 손님 프로필에서 자리 양보를 부탁해 보세요.'],
    ['bar-swap-expire','받은 맞교환 요청 만료'],
  ]],
  ['대화와 손님', [
    ['bar-focus-request','옆자리 1:1 대화 요청'], ['bar-focus','옆자리와 1:1 대화 중'],
    ['bar-profiles','손님 프로필·음소거·신고'],
  ]],
];
export { scenarios };

const incomingSwaps = {
  'bar-swap-near':1, 'bar-swap-far':9, 'bar-swap-host':11,
  'bar-swap-first':4, 'bar-swap-wait':3, 'bar-swap-decline':4, 'bar-swap-expire':4,
};
let scenario, state, matchingSince, startedAt, lastTick, replyAt, scripted, offerFinished;
const vacancyAt = new Map();

export function setScenario(next) {
  scenario=next;
  matchingSince=0;
  offerFinished=false;
  vacancyAt.clear();
  replyAt=0;
  scripted=false;
  lastTick=startedAt=Date.now();
  const rooms = {
    one:[room(1,4)],
    'visit-expired':[room(1,2)],
    vacancy:[room(1,CAPACITY)],
    many:[4,7,2,8,3].map((count,i)=>room(i+1,count)),
    fallback:[room(1,4,'경기'),room(2,5,'부산')],
    filtered:[room(1,12),room(2,4,'서울',true),room(3,3)],
  };
  state={
    member:{id:'qa-member',nickname:'테스트 손님',adult:true,photoChecked:!['unverified','bar-camera'].includes(next),gender:next==='unverified'?null:'female',photo:next==='unverified'?null:photo2,balance:10000},
    rooms:rooms[next]||[], visit:null, guests:[], requests:[], partners:{}, declinedSwapIds:[], waitlist:[], notifications:[], seatNeutralClock:next!=='bar-host', safetyPaused:next==='paused',
  };
  if (!next.startsWith('bar-') || next === 'bar-camera') return;

  const mine = next === 'bar-host' ? 11 : next === 'bar-swap-wait' ? 8 : 0;
  const time = {'bar-low':240,'bar-ended':0,'bar-order':810,'bar-held-drink':810,'bar-rejoin':1240}[next] ?? 1800;
  const away = next === 'bar-rejoin';
  const solo = ['bar-solo','bar-arrival'].includes(next);
  const guestsAt = {
    'bar-held-drink':[3,9],
    'bar-remote-facing':[5], 'bar-departure':[5], 'bar-move':[3,8], 'bar-move-near':[1,7], 'bar-move-host':[3,8], 'bar-move-fail':[3,8],
    'bar-guest-move':[2,8], 'bar-swap-out':[3,7], 'bar-swap-no':[3,7],
    'bar-focus':[1,6], 'bar-focus-request':[1,6],
  };
  const swapSeat = incomingSwaps[next];
  const layout = swapSeat == null ? guestsAt[next] || [2,6,9] : [swapSeat,5].filter((seat, i, all) => all.indexOf(seat) === i);
  state.guests = solo || away ? [] : (next === 'bar-full'
    ? Array.from({length:CAPACITY - 1}, (_, i) => makeGuest(i+1,i))
    : layout.map(makeGuest));
  state.visit={id:'qa-visit',region:'서울',number:1,seat:away?null:mine,drinkId:'highball',seconds:time,away,soloPaused:solo};
  state.rooms=[room(1,state.guests.length+(away?0:1)), room(2,0)];
  if (swapSeat != null) {
    state.requests=[request('swap','qa-guest-0',state.member.id, next === 'bar-swap-expire' ? 9000 : 300000)];
  }
  if (next === 'bar-focus-request') state.requests=[request('focus','qa-guest-0',state.member.id,300000)];
  if (next === 'bar-focus') state.partners={[state.member.id]:'qa-guest-0','qa-guest-0':state.member.id};
}
setScenario('many');

function request(kind, sender, receiver, lifetime = 45000) {
  return {id:`qa-${kind}-${Date.now()}`,kind,sender,receiver,
    receiver_seat:receiver===state.member.id?state.visit.seat:state.guests.find(guest=>guest.id===receiver)?.seat,
    expires_at:new Date(Date.now()+lifetime).toISOString()};
}

function syncRoom() {
  if (!state.visit || state.visit.away) return;
  state.visit.soloPaused = (state.seatNeutralClock || state.visit.seat !== 11) && state.guests.length === 0 && state.visit.seconds > 0;
  state.rooms=[room(state.visit.number,state.guests.length+1,state.visit.region), room(2,0)];
}

function respondToSwap(offer, accept) {
  state.requests=state.requests.filter(item=>item.id!==offer.id);
  if (!accept) {
    if (offer.sender===state.member.id) state.declinedSwapIds.unshift(offer.id);
    return;
  }
  const mine = offer.receiver === state.member.id;
  const guest = state.guests.find(item=>item.id===(mine?offer.sender:offer.receiver));
  if (!guest) return;
  [state.visit.seat,guest.seat]=[guest.seat,state.visit.seat];
  state.member.balance+=mine?500:-500;
  state.partners={};
  syncRoom();
}

function tick(now) {
  const seconds = Math.floor((now-lastTick)/1000);
  if (seconds > 0) {
    lastTick+=seconds*1000;
    if (state.visit && !state.visit.soloPaused && (state.seatNeutralClock || state.visit.seat !== 11)) state.visit.seconds=Math.max(0,state.visit.seconds-seconds);
    state.guests.forEach(guest=>{if(state.seatNeutralClock || guest.seat!==11)guest.seconds=Math.max(0,guest.seconds-seconds);});
  }
  if (scenario === 'bar-remote-facing' && state.guests[0] && now-startedAt >= 2200) state.guests[0].facing=75;
  if (!scripted && now-startedAt >= 5000 && state.visit && !state.visit.away) {
    if (scenario === 'bar-arrival') state.guests=[makeGuest(3)];
    if (scenario === 'bar-departure' || scenario === 'bar-remote-facing') state.guests=[];
    if (scenario === 'bar-guest-move') [state.guests[0].seat,state.guests[1].seat]=[4,10];
    scripted=true;
    syncRoom();
  }
  if (replyAt && now >= replyAt) {
    const offer=state.requests.find(item=>item.kind==='swap' && item.sender===state.member.id);
    if (offer) respondToSwap(offer,scenario!=='bar-swap-no');
    replyAt=0;
  }
  state.requests=state.requests.filter(item=>Date.parse(item.expires_at)>now);
  if (state.visit?.away && state.visit.seconds===0) state.visit=null;
}

export function qaRequest(body,method) {
  if(method==='GET')return {apiReady:true,iceServers:[]};
  const {action,data={}}=body;
  tick(Date.now());
  if(action==='quick-search'){
    if(data.command==='cancel'){ matchingSince=0; return {result:null}; }
    if(offerFinished || !['match','decline','expired'].includes(scenario))return {result:null};
    if(data.command==='start')matchingSince=Date.now();
    const elapsed=Date.now()-matchingSince;
    const lifetime=scenario==='decline'?8000:scenario==='expired'?12000:90000;
    if(!matchingSince||elapsed<1500)return {result:null};
    if(elapsed>=lifetime){offerFinished=true;return {result:null};}
    return {result:{id:'qa-offer',region:data.region,number:1,guest:quickGuest,expiresAt:new Date(matchingSince+lifetime).toISOString()}};
  }

  const roomKey = `${data.region}:${data.number}`;
  if(action==='waitlist'){
    const target=state.rooms.find(item=>item.region===data.region && item.number===data.number);
    if(target?.count!==CAPACITY || target.hasReportedGuest) throw new Error('빈자리 알림을 신청할 수 없는 호점이에요.');
    vacancyAt.set(roomKey,Date.now()+5000);
    state.waitlist=[...vacancyAt.keys()];
  }
  if(action==='waitlist-off'){
    if(data.region && data.number) vacancyAt.delete(roomKey);
    else vacancyAt.clear();
    state.waitlist=[...vacancyAt.keys()];
  }
  for(const target of state.rooms){
    const key=`${target.region}:${target.number}`;
    const deadline=vacancyAt.get(key);
    if(deadline==null || Date.now()<deadline) continue;
    target.count=CAPACITY-1;
    vacancyAt.delete(key);
    state.waitlist=[...vacancyAt.keys()];
    state.notifications.unshift({
      id:`qa-vacancy-${key}`,kind:'available',title:`${target.region} ${target.number}호점`,
      body:'빈자리가 생겼어요. 지금 입장할 수 있어요.',read_at:null,data:{region:target.region,number:target.number},
    });
  }
  if(action==='read'){
    for(const notification of state.notifications) notification.read_at=new Date().toISOString();
  }

  let result;
  if(action==='preview'){
    state.member.balance-=500;
    result=state.guests.length ? state.guests : [quickGuest];
  }
  if(action==='enter'){
    if (state.visit?.away && state.visit.region===data.region && state.visit.number===data.number && !data.drinkId) {
      Object.assign(state.visit,{away:false,seat:0});
    } else {
      const drink=DRINKS.find(item=>item.id===data.drinkId)||DRINKS[0];
      const target = state.rooms.find(room => room.region===data.region && room.number===data.number);
      if(target?.count>=CAPACITY || target?.hasReportedGuest) throw new Error('이 호점에 입장할 수 없어요.');
      state.member.balance-=drink.price;
      const count = data.firstGuest ? 0 : target?.count || 1;
      state.guests=Array.from({length:count},(_,i)=>makeGuest(i+1,i));
      state.visit={id:'qa-visit',region:data.region,number:data.number||1,seat:0,drinkId:drink.id,
        seconds:scenario==='visit-expired'?62:drink.minutes*60,away:false};
    }
    lastTick=Date.now();
    syncRoom();
  }
  if(action==='move' && state.visit){
    if(scenario==='bar-move-fail')throw new Error('다른 손님이 먼저 앉았어요.');
    if(state.guests.some(guest=>guest.seat===data.seat))throw new Error('이미 손님이 앉아 있어요.');
    state.visit.seat=data.seat;
    state.partners={};
    syncRoom();
  }
  if(action==='order' && state.visit){
    const drink=DRINKS.find(item=>item.id===data.drinkId)||DRINKS[0];
    if(state.member.balance<drink.price) throw new Error('주문할 수 없어요.');
    state.member.balance-=drink.price;
    state.visit.drinkId=drink.id;
    state.visit.seconds+=drink.minutes*60;
    syncRoom();
  }
  if(action==='request' && state.visit && data.kind!=='wave'){
    state.requests=[request(data.kind,state.member.id,data.targetId)];
    result={id:state.requests[0].id};
    if(data.kind==='swap')replyAt=Date.now()+2700;
  }
  if(action==='respond'){
    const offer=state.requests.find(item=>item.id===data.id);
    if (!offer) throw new Error('요청 시간이 끝났어요.');
    if(offer.kind==='swap')respondToSwap(offer,data.accept);
    else {
      if(data.accept)state.partners={[offer.sender]:offer.receiver,[offer.receiver]:offer.sender};
      state.requests=[];
    }
  }
  if(action==='cancel'){state.requests=[];replyAt=0;}
  if(action==='focus-end')state.partners={};
  if(action==='report'||action==='block'){
    state.reportedIds=[...new Set([...(state.reportedIds||[]),data.targetId])];
    if(state.partners?.[state.member.id]===data.targetId)state.partners={};
    result={id:'qa-report'};
  }
  if(action==='leave' && state.visit){
    state.rooms=[room(state.visit.number,state.guests.length,state.visit.region),room(2,0)];
    Object.assign(state.visit,{seat:null,away:true,soloPaused:false});
    state.guests=[];
    state.requests=[];
    state.partners={};
  }
  return {state:structuredClone(state),result};
}
