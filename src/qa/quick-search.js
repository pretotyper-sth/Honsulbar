import { DRINKS } from '../model';
import photo from '../../scripts/local-guests/1.jpg?inline';

const guest = {id:'qa-guest', nickname:'느긋한 토끼', gender:'male', photo, seat:1, drinkId:'highball', seconds:1800};
export const scenarios = [
 ['one','서울 1곳'], ['many','서울 5곳'], ['fallback','다른 지역만'], ['filtered','만석·입장 제한'],
 ['empty','빈 방 대기'], ['match','자동 매칭'], ['decline','상대가 거절'], ['expired','시간 초과'],
 ['unverified','프로필 미확인'], ['paused','안전 점검'],
];
let scenario, state, matchingSince;

export function setScenario(next) {
 scenario=next;
 matchingSince=0;
 const room=(number,count,region='서울',hasReportedGuest=false)=>({region,number,count,hasReportedGuest});
 const rooms = {
   one:[room(1,4)],
   many:[4,7,2,8,3].map((count,i)=>room(i+1,count)),
   fallback:[room(1,4,'경기'),room(2,5,'부산')],
   filtered:[room(1,12),room(2,4,'서울',true),room(3,3)],
 };
 state={
   member:{id:'qa-member',nickname:'테스트 손님',adult:true,photoChecked:next!=='unverified',gender:'female',photo,balance:10000},
   rooms:rooms[next]||[], visit:null, guests:[], safetyPaused:next==='paused',
 };
}
setScenario('many');

export function qaRequest(body,method) {
 if(method==='GET')return {apiReady:true,iceServers:[]};
 const {action,data={}}=body;
 if(action==='quick-search'){
  if(data.command==='cancel'){ matchingSince=0; return {result:null}; }
  if(!['match','decline','expired'].includes(scenario))return {result:null};
  if(data.command==='start')matchingSince=Date.now();
  const elapsed=Date.now()-matchingSince;
  const lifetime=scenario==='decline'?8000:scenario==='expired'?12000:90000;
  if(!matchingSince||elapsed<1500||elapsed>=lifetime)return {result:null};
  return {result:{id:'qa-offer',region:data.region,number:1,guest,expiresAt:new Date(matchingSince+lifetime).toISOString()}};
 }
 let result;
 if(action==='preview'){
  state.member.balance-=500;
  result=[guest];
 }
 if(action==='enter'){
  const drink=DRINKS.find(item=>item.id===data.drinkId)||DRINKS[0];
  state.member.balance-=drink.price;
  state.guests=data.firstGuest?[]:[guest];
  state.visit={id:'qa-visit',region:data.region,number:data.number||1,seat:0,drinkId:drink.id,
    seconds:drink.minutes*60,away:false,soloPaused:!!data.firstGuest};
 }
 if(action==='leave'){
  state.visit=null;
  state.guests=[];
 }
 return {state:structuredClone(state),result};
}
