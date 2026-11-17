import { barMusic } from './bar-music.js';
import { barThemes } from './bar-themes.js';
import { BASE_DRINK_MINUTES, DRINKS, REGIONS } from './model.js';

export const BAR_THEME_LABELS = {
  original:'클래식 바', izakaya:'일본 이자카야', speakeasy:'미국 재즈 바', holiday:'크리스마스 바',
};

export const BAR_OPERATIONS_DEFAULTS = {
  tracks:barMusic.map(track => track.file),
  bgmVolume:100,
  roomThemes:[],
  lobbyNotice:'',
  defaultDrinkMinutes:BASE_DRINK_MINUTES,
  drinkMinutes:Object.fromEntries(DRINKS.filter(drink => drink.minutes !== BASE_DRINK_MINUTES)
    .map(drink => [drink.id, drink.minutes])),
};

const trackIds = new Set(BAR_OPERATIONS_DEFAULTS.tracks);
const themeIds = new Set(barThemes.map(theme => theme.id));
export const MAX_ROOM_THEMES = 50;
export const MAX_LOBBY_NOTICE = 90;

export const MIN_DRINK_MINUTES = 1;
export const MAX_DRINK_MINUTES = 120;
const drinkIds = new Set(DRINKS.map(drink => drink.id));
const isDrinkMinutes = value => Number.isInteger(value) && value >= MIN_DRINK_MINUTES && value <= MAX_DRINK_MINUTES;
export const DRINK_TIME_CHANGED = '음료 이용시간이 바뀌었어요. 확인한 뒤 다시 시도해 주세요.';

export function validateBarOperations(input) {
  if (!input || typeof input !== 'object') throw new Error('운영 설정을 확인해 주세요.');
  const { tracks, bgmVolume, roomThemes, lobbyNotice,
    defaultDrinkMinutes = BAR_OPERATIONS_DEFAULTS.defaultDrinkMinutes,
    drinkMinutes = BAR_OPERATIONS_DEFAULTS.drinkMinutes,
  } = input;
  if (!isDrinkMinutes(defaultDrinkMinutes) || !drinkMinutes || typeof drinkMinutes !== 'object' ||
      Array.isArray(drinkMinutes) || Object.entries(drinkMinutes).some(([id, minutes]) => !drinkIds.has(id) || !isDrinkMinutes(minutes))) {
    throw new Error('음료 이용시간은 1~120분 사이의 정수로 입력해 주세요.');
  }
  if (!Array.isArray(tracks) || !tracks.length || tracks.length > trackIds.size ||
      new Set(tracks).size !== tracks.length || !tracks.every(track => trackIds.has(track))) {
    throw new Error('재생할 음원을 한 곡 이상 선택해 주세요.');
  }
  if (!Number.isInteger(bgmVolume) || bgmVolume < 0 || bgmVolume > 100) {
    throw new Error('기본 음량을 0~100%로 입력해 주세요.');
  }
  if (!Array.isArray(roomThemes) || roomThemes.length > MAX_ROOM_THEMES) {
    throw new Error('호점 테마는 50개까지 지정할 수 있어요.');
  }
  const keys = new Set();
  const themes = roomThemes.map(item => {
    const { region, number, theme } = item || {};
    if (!REGIONS.includes(region) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647 || !themeIds.has(theme)) {
      throw new Error('지역, 호점 번호, 테마를 확인해 주세요.');
    }
    const key = `${region}:${number}`;
    if (keys.has(key)) throw new Error('같은 호점은 한 번만 지정할 수 있어요.');
    keys.add(key);
    return { region, number, theme };
  });
  if (typeof lobbyNotice !== 'string' || lobbyNotice.length > MAX_LOBBY_NOTICE) {
    throw new Error('홈 공지는 90자까지 입력할 수 있어요.');
  }
  return { tracks:[...tracks], bgmVolume, roomThemes:themes, lobbyNotice:lobbyNotice.trim(), defaultDrinkMinutes, drinkMinutes:{...drinkMinutes} };
}
