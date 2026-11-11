import { CAPACITY, DRINKS } from '../model';
import photo from '../../scripts/local-guests/1.jpg?inline';

const guest = {id:'qa-guest', nickname:'느긋한 토끼', gender:'male', photo, seat:1, drinkId:'highball', seconds:1800};
export const scenarios = [
 ['one','서울 1곳'], ['many','서울 5곳'], ['fallback','다른 지역만'], ['filtered','만석 표시·제한 숨김'], ['vacancy','빈자리 알림'],
 ['empty','빈 방 대기'], ['match','자동 매칭'], ['decline','상대가 거절'], ['expired','매칭 시간 초과'],
 ['visit-expired','이용시간 초과'], ['unverified','프로필 미등록'], ['paused','안전 점검'],
];
let scenario, state, matchingSince, visitDeadline, offerFinished;
const vacancyAt = new Map();

export function setScenario(next) {
 scenario=next;
 matchingSince=0;
 visitDeadline=null;
 offerFinished=false;
 vacancyAt.clear();
 const room=(number,count,region='서울',hasReportedGuest=false)=>({region,number,count,hasReportedGuest});
 const rooms = {
   one:[room(1,4)],
   'visit-expired':[room(1,2)],
   many:[4,7,2,8,3].map((count,i)=>room(i+1,count)),
   fallback:[room(1,4,'경기'),room(2,5,'부산')],
   filtered:[room(1,CAPACITY),room(2,4,'서울',true),room(3,3)],
   vacancy:[room(1,CAPACITY)],
 };
 state={
   member:{id:'qa-member',nickname:'테스트 손님',adult:true,photoChecked:next!=='unverified',gender:next==='unverified'?null:'female',photo:next==='unverified'?null:photo,balance:10000},
   rooms:rooms[next]||[], visit:null, guests:[], waitlist:[], notifications:[], seatNeutralClock:true, safetyPaused:next==='paused',
 };
}
setScenario('many');

export function qaRequest(body,method) {
 if(method==='GET')return {apiReady:true,iceServers:[]};
 const {action,data={}}=body;
 if(action==='quick-search'){
  if(data.command==='cancel'){ matchingSince=0; return {result:null}; }
  if(offerFinished || !['match','decline','expired'].includes(scenario))return {result:null};
  if(data.command==='start')matchingSince=Date.now();
  const elapsed=Date.now()-matchingSince;
  const lifetime=scenario==='expired'?12000:90000;
  if(!matchingSince||elapsed<1500)return {result:null};
  if(elapsed>=lifetime || (scenario==='decline' && elapsed>=8000)){
   offerFinished=true;
   return {result:null};
  }
  return {result:{id:'qa-offer',region:data.region,number:1,guest,expiresAt:new Date(matchingSince+lifetime).toISOString()}};
 }
 const roomKey = `${data.region}:${data.number}`;
 if(action==='waitlist'){
  const room=state.rooms.find(item=>item.region===data.region && item.number===data.number);
  if(room?.count!==CAPACITY || room.hasReportedGuest) throw new Error('빈자리 알림을 신청할 수 없는 호점이에요.');
  vacancyAt.set(roomKey,Date.now()+5000);
  state.waitlist=[...vacancyAt.keys()];
 }
 if(action==='waitlist-off'){
  if(data.region && data.number) vacancyAt.delete(roomKey);
  else vacancyAt.clear();
  state.waitlist=[...vacancyAt.keys()];
 }
 for(const room of state.rooms){
  const key=`${room.region}:${room.number}`;
  const deadline=vacancyAt.get(key);
  if(deadline==null || Date.now()<deadline) continue;
  room.count=CAPACITY-1;
  vacancyAt.delete(key);
  state.waitlist=[...vacancyAt.keys()];
  state.notifications.unshift({
   id:`qa-vacancy-${key}`,kind:'available',title:`${room.region} ${room.number}호점`,
   body:'빈자리가 생겼어요. 지금 입장할 수 있어요.',read_at:null,data:{region:room.region,number:room.number},
  });
 }
 if(action==='read'){
  for(const notification of state.notifications) notification.read_at=new Date().toISOString();
 }
 let result;
 if(action==='preview'){
  state.member.balance-=500;
  result=[guest];
 }
 if(action==='block'){
  state.reportedIds=[...new Set([...(state.reportedIds||[]),data.targetId])];
 }
 if(action==='enter'){
  const drink=DRINKS.find(item=>item.id===data.drinkId)||DRINKS[0];
  const room = state.rooms.find(item => item.region===data.region && item.number===data.number);
  if(room?.count>=CAPACITY || room?.hasReportedGuest) throw new Error('이 호점에 입장할 수 없어요.');
  state.member.balance-=drink.price;
  const guestCount = data.firstGuest ? 0 : room?.count || 1;
  state.guests=Array.from({length:guestCount}, (_, index) => ({
    ...guest, id:`qa-guest-${index+1}`, seat:index+1,
  }));
  const seconds = scenario==='visit-expired' ? 62 : drink.minutes*60;
  visitDeadline = state.guests.length ? Date.now()+seconds*1000 : null;
  state.visit={id:'qa-visit',region:data.region,number:data.number||1,seat:0,drinkId:drink.id,
    seconds,away:false,soloPaused:state.guests.length===0};
 }
 if(action==='move' && state.visit){
  if(state.guests.some(person=>person.seat===data.seat)) throw new Error('이미 손님이 앉아 있어요.');
  state.visit.seat=data.seat;
 }
 if(action==='order' && state.visit){
  const drink=DRINKS.find(item=>item.id===data.drinkId);
  if(!drink || state.member.balance<drink.price) throw new Error('주문할 수 없어요.');
  state.member.balance-=drink.price;
  state.visit.drinkId=drink.id;
  if(visitDeadline==null) state.visit.seconds+=drink.minutes*60;
  else visitDeadline=Math.max(Date.now(),visitDeadline)+drink.minutes*60*1000;
 }
 if(state.visit && visitDeadline!=null){
  state.visit.seconds=Math.max(0,Math.ceil((visitDeadline-Date.now())/1000));
 }
 if(action==='leave'){
  state.visit=null;
  state.guests=[];
 }
 return {state:structuredClone(state),result};
}
