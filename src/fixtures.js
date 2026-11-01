// Local interaction fixtures, not live members. Do not use as production occupancy.
export const seatOrder = [0, 1, 2, 4, 6, 8, 9, 10, 5, 7, 11, 3];
const portraits = [
  ['female', 44], ['male', 32], ['female', 47], ['male', 11],
  ['female', 49], ['male', 33], ['female', 68], ['male', 12],
  ['female', 65], ['male', 52], ['male', 13], ['female', 48],
];
const nicknames = ['느긋한 토끼','말랑한 구름','반짝이는 잔','조용한 여우','포근한 오렌지','신나는 산책러','담백한 고양이','달빛 감자','차분한 치즈','몽글한 달팽이','느긋한 잔','반짝이는 여우'];
export const guestsFor = count => portraits.slice(0, count).map(([gender, number], i) => ({
  id: `guest-${i}`, nickname: nicknames[i], seconds: [1140, 45, 1560, 840, 1300, 1700, 600, 950, 400, 1450, 1800, 1100][i], gender, seat: seatOrder[i], drinkId: ['wine', 'highball', 'citrus', 'beer', 'whiskey', 'cocktail'][i % 6],
  photo: `https://randomuser.me/api/portraits/${gender === 'female' ? 'women' : 'men'}/${number}.jpg`,
}));
export const localProfile = { gender: 'male', photo: 'https://randomuser.me/api/portraits/men/22.jpg' };
export const conversation = [
  '오늘 하루 어땠어요? 저는 이제야 좀 쉬는 기분이에요.',
  '저도요. 여기 조명이 좋아서 잠깐 들렀어요.',
  '그거 하이볼이에요? 저는 오늘 와인 골랐어요.',
  '다음 잔은 뭐 마실까 고민 중이에요.',
  '이 자리 좋네요. 목소리도 잘 들리고요.',
];
