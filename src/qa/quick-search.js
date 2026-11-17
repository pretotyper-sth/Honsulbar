import { CAPACITY, DRINKS, BASE_DRINK_MINUTES } from '../model';
import photo1 from '../../scripts/local-guests/1.jpg?inline';
import photo2 from '../../scripts/local-guests/2.jpg?inline';
import photo3 from '../../scripts/local-guests/3.jpg?inline';
import photo4 from '../../scripts/local-guests/4.jpg?inline';

const photos = [photo1, photo2, photo3, photo4];
const room = (number, count, region = '서울', hasReportedGuest = false) => ({region, number, count, hasReportedGuest});
const makeGuest = (seat, index = 0) => ({
  id:`qa-guest-${index}`, nickname:`${['느긋한 토끼','포근한 구름','조용한 여우','반짝이는 달'][index % 4]}${index >= 4 ? index+1 : ''}`,
  gender:index % 2 ? 'female' : 'male', photo:photos[index % photos.length], seat,
  drinkId:DRINKS[index % DRINKS.length].id, seconds:DRINKS[index % DRINKS.length].minutes * 60 - 32 * index, mic:index % 2 === 0,
});
const quickGuest = makeGuest(1);
const scenarios = [
  ['홈 · 계정과 결제', [
    ['home-sub-active','구독 중 탈퇴','설정 → 회원탈퇴 · 해지 안내'],
    ['home-sub-canceled','해지 후 남은 기간에 탈퇴','설정 → 회원탈퇴 · 탈퇴 가능'],
    ['home-sub-expired','구독 만료 후 탈퇴','설정 → 회원탈퇴'],
    ['home-withdraw','미구독 계정 탈퇴','설정 → 회원탈퇴'],
    ['home-sub-benefits','구독 혜택으로 입장','미리보기·입장·연장 시 잔액 확인'],
    ['home-low-balance','입장 포인트 부족','혼술바 입장하기 → 호점 선택'],
    ['home-point-history','포인트 내역 · 출석 완료','포인트 상점에서 확인'],
  ]],
  ['홈 · 고객센터와 알림', [
    ['home-inquiry','문의 접수','문의 내용을 입력하고 접수'],
    ['home-inquiry-answer','운영팀 답변 알림','알림을 눌러 답변 확인'],
    ['home-protected-room','신고·차단 상대가 있는 호점','검색 결과에서 1호점 제외'],
    ['paused','안전 점검 중'],
  ]],
  ['입장과 매칭', [
    ['one','서울 1곳'], ['many','서울 5곳'], ['fallback','다른 지역만'], ['filtered','만석 표시·제한 숨김'], ['vacancy','빈자리 알림'],
    ['empty','빈 방 대기'], ['match','자동 매칭'], ['decline','상대가 거절'], ['expired','시간 초과'],
    ['unverified','프로필 미등록'], ['visit-expired','이용시간 초과'], ['bar-rejoin','남은 시간으로 재입장'],
    ['bar-camera','촬영 가이드','내 프로필 → 얼굴 확인하기'],
    ['home-camera-retry-photo','촬영 재시도 · 등록 사진'],
    ['home-camera-retry-lighting','촬영 재시도 · 조명과 얼굴 위치'],
  ]],
  ['바 화면과 이용 시간', [
    ['view-guide','첫 입장 시점 안내','홈에서 혼술바에 입장해 확인'],
    ['bar-third','기본 3D·옷 색·소리 방향'], ['bar-first','1인칭'], ['bar-flat','2D'], ['bar-full','12석 만석'],
    ['bar-remote-facing','다른 손님 의자 회전·퇴장'], ['bar-solo','혼자 대기 · 20:00'], ['bar-arrival','5초 뒤 손님 입장'], ['bar-departure','5초 뒤 손님 퇴장'],
    ['bar-low','5분 미만 경고'], ['bar-ended','이용 시간 종료'], ['bar-order','한 잔 더 주문'], ['bar-held-drink','손에 든 잔 · 잔량과 이동'],
    ['bar-host','사장 자리 · 시간 제한 없음'], ['bar-gift-incoming','한 잔 받기'],
  ]],
  ['자리 이동과 맞교환', [
    ['bar-move','빈자리 이동·내 발소리'], ['bar-move-near','옆자리 인사 후 이동'], ['bar-move-host','사장 자리로 이동'],
    ['bar-move-blocked','옆자리 차단 후 이동','4번은 차단됨 · 6번도 차단하면 바로 이동'],
    ['bar-move-fail','이동 실패 후 원래 자리'], ['bar-guest-move','다른 손님 둘이 동시에 이동'],
    ['bar-swap-near','가까운 자리 맞교환'], ['bar-swap-far','먼 자리 맞교환'], ['bar-swap-host','사장 자리 맞교환'],
    ['bar-swap-first','1인칭에서 맞교환'], ['bar-swap-wait','내가 먼저 비켜서 기다리기'], ['bar-swap-decline','받은 맞교환 거절'],
    ['bar-swap-out','보낸 요청을 상대가 수락','4번 손님 프로필에서 자리 양보를 부탁해 보세요.'],
    ['bar-swap-no','보낸 요청을 상대가 거절','4번 손님 프로필에서 자리 양보를 부탁해 보세요.'],
    ['bar-swap-expire','받은 맞교환 요청 만료'],
  ]],
  ['대화와 손님', [
    ['bar-focus-request','옆자리 1:1 대화 요청'], ['bar-focus','옆자리와 1:1 대화 중'],
    ['bar-focus-right-end','오른쪽 끝자리 1:1 요청'],
    ['bar-profiles','손님 프로필·음소거·신고'],
    ['bar-received-report','신고당한 상태','옆자리 프로필에서 연결 제한 확인'],
    ['bar-received-block','대화 중 차단당함','8초 후 1:1 대화 종료'],
  ]],
];
export { scenarios };

const incomingSwaps = {
  'bar-swap-near':1, 'bar-swap-far':9, 'bar-swap-host':11,
  'bar-swap-first':4, 'bar-swap-wait':3, 'bar-swap-decline':4, 'bar-swap-expire':4,
};
let scenario, state, matchingSince, startedAt, lastTick, replyAt, scripted, offerFinished;
const vacancyAt = new Map();
const kstDate = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});

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
    'view-guide':[room(1,2)],
    'visit-expired':[room(1,2)],
    vacancy:[room(1,CAPACITY)],
    many:[4,7,2,8,3].map((count,i)=>room(i+1,count)),
    fallback:[room(1,4,'경기'),room(2,5,'부산')],
    filtered:[room(1,12),room(2,4,'서울',true),room(3,3)],
  };
  state={
    member:{id:'qa-member',nickname:'테스트 손님',adult:true,photoChecked:!['unverified','bar-camera'].includes(next) && !next.startsWith('home-camera-retry-'),gender:next==='unverified'?null:'female',photo:next==='unverified'?null:photo2,balance:10000},
    rooms:rooms[next]||[], visit:null, guests:[], requests:[], partners:{}, declinedSwapIds:[], waitlist:[], notifications:[], seatNeutralClock:next!=='bar-host', safetyPaused:next==='paused',
  };
  if (next.startsWith('home-')) {
    state.rooms=rooms.many;
    if (next==='home-protected-room') state.rooms=[room(1,4,'서울',true),room(2,4)];
    if (['home-sub-active','home-sub-canceled','home-sub-expired','home-sub-benefits'].includes(next)) {
      const expired=next==='home-sub-expired';
      Object.assign(state.member,{
        subscribed:!expired,
        subAutoRenew:next!=='home-sub-canceled',
        subExpiresAt:new Date(startedAt+(expired?-1:14)*86400000).toISOString(),
      });
    }
    if (next==='home-low-balance') state.member.balance=100;
    if (next==='home-point-history') {
      state.attendanceDate=kstDate.format(startedAt);
      state.ledger=[
        {id:'qa-ledger-ad',label:'매일 출석',amount:1000,created_at:new Date(startedAt).toISOString()},
        {id:'qa-ledger-entry',label:'혼술바 입장',amount:-500,created_at:new Date(startedAt-86400000).toISOString()},
      ];
    }
    if (next==='home-inquiry-answer') {
      const inquiry={id:'qa-inquiry',category:'결제·구독 문의',message:'구독을 해지해도 남은 기간을 이용할 수 있나요?',
        answer:'네. 자동 결제를 해지한 뒤에도 현재 이용 기간이 끝날 때까지 구독 혜택을 이용할 수 있어요.',
        created_at:new Date(startedAt-86400000).toISOString()};
      state.inquiries=[inquiry];
      state.notifications=[{id:'qa-inquiry-notification',kind:'inquiry',title:'문의에 답변이 도착했어요',
        body:'결제·구독 문의',read_at:null,data:{inquiryId:inquiry.id}}];
    }
  }
  if (!next.startsWith('bar-') || next === 'bar-camera') return;

  const mine = {'bar-host':11,'bar-swap-wait':8,'bar-focus-right-end':10,'bar-move-blocked':4}[next] ?? 0;
  const time = {'bar-low':240,'bar-ended':0,'bar-order':810,'bar-held-drink':810,'bar-rejoin':1040}[next] ?? BASE_DRINK_MINUTES*60;
  const away = next === 'bar-rejoin';
  const solo = ['bar-solo','bar-arrival'].includes(next);
  const guestsAt = {
    'bar-held-drink':[3,9],
    'bar-remote-facing':[5], 'bar-departure':[5], 'bar-move':[3,8], 'bar-move-near':[1,7], 'bar-move-host':[3,8], 'bar-move-fail':[3,8],
    'bar-guest-move':[2,8], 'bar-swap-out':[3,7], 'bar-swap-no':[3,7],
    'bar-focus':[1,6], 'bar-focus-request':[1,6],
    'bar-focus-right-end':[9,4],
    'bar-move-blocked':[3,5],
    'bar-received-report':[1,6], 'bar-received-block':[1,6],
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
  if (next === 'bar-gift-incoming') {
    state.requests=[{...request('drink-gift',state.guests[0].id,state.member.id,60000), gift_drink_id:'wine'}];
  }
  if (next === 'bar-focus-request' || next === 'bar-focus-right-end') state.requests=[request('focus','qa-guest-0',state.member.id,300000)];
  if (next === 'bar-focus' || next === 'bar-received-block') state.partners={[state.member.id]:'qa-guest-0','qa-guest-0':state.member.id};
  if (next === 'bar-received-report' || next === 'bar-move-blocked') protectPair('qa-guest-0');
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
  const restricted=state.guests.some(guest=>state.reportedIds?.includes(guest.id));
  state.rooms=[room(state.visit.number,state.guests.length+1,state.visit.region,restricted), room(2,0)];
}

function protectPair(id) {
  state.reportedIds=[...new Set([...(state.reportedIds||[]),id])];
  state.guests=state.guests.map(guest=>guest.id===id?{...guest,photo:null}:guest);
  if(state.partners[state.member.id]===id) state.partners={};
  state.requests=state.requests.filter(offer=>offer.sender!==id && offer.receiver!==id);
  syncRoom();
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
  if (scenario === 'bar-received-block' && now-startedAt >= 8000 && !state.reportedIds?.includes('qa-guest-0')) protectPair('qa-guest-0');
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
  if(action==='login')setScenario(scenario);
  if(!state.member)throw Object.assign(new Error('다시 시작해 주세요.'),{status:401});
  if(action==='withdraw'){
    if(state.member.subscribed && state.member.subAutoRenew!==false)throw new Error('정기 구독을 먼저 해지해 주세요.');
    state.member=null;
    return {ok:true};
  }
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
    spendPoints(500);
    result=state.guests.length ? state.guests : [quickGuest];
  }
  if(action==='enter'){
    if (state.visit?.away && state.visit.region===data.region && state.visit.number===data.number && !data.drinkId) {
      Object.assign(state.visit,{away:false,seat:0});
    } else {
      const drink=DRINKS.find(item=>item.id===data.drinkId)||DRINKS[0];
      const target = state.rooms.find(room => room.region===data.region && room.number===data.number);
      if(target?.count>=CAPACITY || target?.hasReportedGuest) throw new Error('이 호점에 입장할 수 없어요.');
      spendPoints(drink.price);
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
    spendPoints(drink.price);
    state.visit.drinkId=drink.id;
    state.visit.seconds+=drink.minutes*60;
    syncRoom();
  }
  if(action==='request' && state.visit && data.kind!=='wave'){
    if(state.reportedIds?.includes(data.targetId))throw new Error('이용자 보호를 위해 연결할 수 없어요.');
    const offer=request(data.kind,state.member.id,data.targetId);
    if (data.kind==='drink-gift') offer.gift_drink_id=data.drinkId;
    if (data.kind==='drink-gift') state.requests.push(offer);
    else state.requests=[...state.requests.filter(item=>item.kind==='drink-gift'),offer];
    result={id:offer.id};
    if(data.kind==='swap')replyAt=Date.now()+2700;
  }
  if(action==='respond'){
    const offer=state.requests.find(item=>item.id===data.id);
    if (!offer) throw new Error('요청 시간이 끝났어요.');
    if(offer.kind==='swap')respondToSwap(offer,data.accept);
    else if (offer.kind==='drink-gift') {
      const drink=DRINKS.find(item=>item.id===offer.gift_drink_id);
      if (data.accept && drink) {
        state.visit.drinkId=drink.id;
        state.visit.seconds+=drink.minutes*60;
      }
      state.requests=state.requests.filter(item=>item.id!==offer.id);
    } else {
      if(data.accept)state.partners={[offer.sender]:offer.receiver,[offer.receiver]:offer.sender};
      state.requests=state.requests.filter(item=>item.id!==offer.id);
    }
  }
  if(action==='cancel'){
    const offer=state.requests.find(item=>item.id===data.id);
    state.requests=state.requests.filter(item=>item.id!==data.id);
    if (offer?.kind==='swap') replyAt=0;
  }
  if(action==='focus-end')state.partners={};
  if(action==='report'||action==='block'){
    protectPair(data.targetId);
    result={id:'qa-report'};
  }
  if(action==='ticket'){
    if(data.kind==='report' && data.targetId)protectPair(data.targetId);
    const inquiry={id:`qa-ticket-${Date.now()}`,category:data.category,message:data.message,answer:null,created_at:new Date().toISOString()};
    state.inquiries=[inquiry,...(state.inquiries||[])];
    result={id:inquiry.id};
  }
  if(action==='leave' && state.visit){
    const restricted=state.guests.some(guest=>state.reportedIds?.includes(guest.id));
    state.rooms=[room(state.visit.number,state.guests.length,state.visit.region,restricted),room(2,0)];
    Object.assign(state.visit,{seat:null,away:true,soloPaused:false});
    state.guests=[];
    state.requests=[];
    state.partners={};
  }
  const output=structuredClone(state);
  if(output.visit){
    output.clockSampleMs=Date.now();
    const paused=output.safetyPaused||(!output.visit.away&&(output.visit.soloPaused||(output.visit.seat===11&&!output.seatNeutralClock)));
    output.visit.clockEndMs=paused?null:lastTick+output.visit.seconds*1000;
  }
  return {state:output,result};
}

function spendPoints(amount) {
  if(state.member.subscribed) return;
  if(state.member.balance<amount) throw new Error('포인트가 부족해요.');
  state.member.balance-=amount;
}
