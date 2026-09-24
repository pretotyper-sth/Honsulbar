import { proximity } from './model.js';

export const SEATS = [[17,12],[17,29],[17,46],[20,64],[32,79],[50,85],[68,79],[80,64],[83,46],[83,29],[83,12],[50,44]];
export const POINT_PACKS = [
  {points:1000,won:1100,bonus:0,label:'기본'},
  {points:3300,won:3300,bonus:10,label:'+10%'},
  {points:6000,won:5500,bonus:20,label:'+20%'},
  {points:10000,won:8800,bonus:25,label:'+25%'},
  {points:20000,won:16500,bonus:33,label:'+33%'}
];
export const SUBSCRIPTIONS = [{id:'monthly',name:'정기 구독',price:13200,description:'포인트 차감 없이 입장·시간 연장·미리보기 이용'}];
export const adjacent = (a,b) => a !== 11 && b !== 11 && Math.abs(a-b) === 1;
export function drinkLevel(seconds, host = false) {
  return { fill:host ? 1 : Math.max(0,Math.min(1,seconds/1800)), low:!host && seconds > 0 && seconds <= 60 };
}
export function directionGain(listener, speaker, angle) {
  const base = proximity(listener,speaker);
  if (speaker === 11 || angle === 0) return base;
  const side = Math.sign(speaker-listener);
  const turn = Math.max(-90,Math.min(90,angle));
  return base * (side === Math.sign(turn) ? 1 : 1 - .95 * Math.abs(turn)/90);
}
export function audioGain(listener,speaker,angle=0,partners={},muted=[]) {
  if (muted.includes(speaker.id)) return 0;
  if (partners[listener.id] && partners[listener.id] !== speaker.id) return 0;
  if (partners[speaker.id] && partners[speaker.id] !== listener.id) return 0;
  return directionGain(listener.seat,speaker.seat,partners[listener.id] === speaker.id ? 0 : angle);
}
export function validPartners(people,pairs) {
  const result = {};
  for (const [a,b] of pairs) {
    const first=people.find(p=>p.id===a), second=people.find(p=>p.id===b);
    if (first && second && adjacent(first.seat,second.seat) && !result[a] && !result[b]) { result[a]=b;result[b]=a; }
  }
  return result;
}
export function claimAttendance(wallet,date) {
  if(wallet.attendanceDate===date) return wallet;
  return {...wallet,balance:wallet.balance+1000,attendanceDate:date};
}
