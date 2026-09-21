export const REGIONS = ['서울', '경기', '인천', '부산', '대구'];
export const CAPACITY = 12;
export const DRINKS = [
  { id: 'highball', name: '하우스 하이볼', note: '위스키에 탄산, 레몬 한 조각', minutes: 30, price: 500, color: '#ddb76d' },
  { id: 'wine', name: '레드 와인', note: '천천히 마시기 좋은 한 잔', minutes: 30, price: 500, color: '#b75c6b' },
  { id: 'wine-hour', name: '싱글몰트 위스키 · 1시간', note: '깊은 향을 천천히 즐기는 잔', minutes: 60, price: 1000, color: '#9c642f' },
  { id: 'beer', name: '생맥주', note: '차갑게 따른 시원한 맥주', minutes: 30, price: 500, color: '#d99d38' },
  { id: 'whiskey', name: '버번 온더락', note: '진한 향을 천천히 즐기는 잔', minutes: 30, price: 500, color: '#b77a3c' },
  { id: 'cocktail', name: '진토닉', note: '허브 향이 산뜻한 칵테일', minutes: 30, price: 500, color: '#b7d6c2' },
  { id: 'citrus', name: '무알코올 시트러스', note: '술 없이도 산뜻하게', minutes: 30, price: 500, color: '#a4b97a' },
];
export const initialWallet = { balance: 1000, expiresAt: null, heldSeconds: 0, welcomed: false, drinkId: null, attendanceDate: null };
export function remaining(wallet, now) {
  return wallet.expiresAt === null ? wallet.heldSeconds : Math.max(0, Math.ceil((wallet.expiresAt - now) / 1000));
}
export function purchase(wallet, id, now, { welcome = false, host = false } = {}) {
  const drink = DRINKS.find(item => item.id === id);
  if (!drink) throw new Error('음료를 선택해 주세요.');
  const price = drink.price;
  if (wallet.balance < price) throw new Error('포인트가 부족해요. 다른 메뉴를 골라주세요.');
  const seconds = remaining(wallet, now) + drink.minutes * 60;
  return { ...wallet, balance: wallet.balance - price, drinkId: id, welcomed: true, expiresAt: host ? null : now + seconds * 1000, heldSeconds: host ? seconds : 0 };
}
export function changeRole(wallet, host, now) {
  const seconds = remaining(wallet, now);
  return { ...wallet, heldSeconds: host ? seconds : 0, expiresAt: host ? null : now + seconds * 1000 };
}
export function addArrival(rooms) {
  const next = rooms.map(room => ({ ...room }));
  const open = next.find(room => room.count < CAPACITY);
  if (open) open.count++;
  if (next.every(room => room.count === CAPACITY)) next.push({ number: Math.max(...next.map(room => room.number)) + 1, count: 0 });
  return next;
}
export function proximity(listener, speaker) {
  if (listener === 11 || speaker === 11) return 1;
  const distance = Math.abs(listener - speaker);
  return distance <= 1 ? 1 : distance === 2 ? .25 : distance === 3 ? .05 : 0;
}

export function transferPoints(payer, receiver, amount) {
  if (![payer, receiver, amount].every(Number.isSafeInteger) || payer < 0 || receiver < 0 || amount <= 0) throw new Error('포인트 정보를 확인해 주세요.');
  if (payer < amount) throw new Error('포인트가 부족해 요청이 취소됐어요.');
  return { payer: payer - amount, receiver: receiver + amount };
}
