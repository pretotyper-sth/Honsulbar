import { SEATS } from './social.js';

export function positionsByDistance(guests, peerIds, seat, gains) {
  const [x,y] = SEATS[seat] || SEATS[0];
  const distance = index => {
    const point = SEATS[index];
    return point ? Math.hypot(point[0]-x, point[1]-y) : Infinity;
  };
  const allowed = new Set(peerIds);
  return guests.filter(person=>allowed.has(person.id) && gains[person.id] > 0)
    .sort((a,b)=>distance(a.seat)-distance(b.seat));
}

export function sfuTrackIds(ordered, recentSpeakers, cutoff, partnerId) {
  if (partnerId) return ordered.some(person=>person.id===partnerId) ? [partnerId] : [];
  const selected = new Set(ordered.slice(0,3).map(person=>person.id));
  for (const person of ordered) if (person.speaker) selected.add(person.id);
  let distant = 0;
  for (const person of ordered) {
    if (distant >= 2) break;
    if (!selected.has(person.id) && recentSpeakers.get(person.id) >= cutoff) {
      selected.add(person.id);
      distant++;
    }
  }
  return [...selected];
}
