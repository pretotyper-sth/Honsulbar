import { barMusic } from './bar-music.js';
import { barThemes } from './bar-themes.js';
import { REGIONS } from './model.js';

export const BAR_THEME_LABELS = {
  original:'클래식 바', izakaya:'일본 이자카야', speakeasy:'미국 재즈 바', holiday:'크리스마스 바',
};

export const BAR_OPERATIONS_DEFAULTS = {
  tracks:barMusic.map(track => track.file),
  bgmVolume:100,
  roomThemes:[],
  lobbyNotice:'',
};

const trackIds = new Set(BAR_OPERATIONS_DEFAULTS.tracks);
const themeIds = new Set(barThemes.map(theme => theme.id));
export const MAX_ROOM_THEMES = 50;
export const MAX_LOBBY_NOTICE = 90;

export function validateBarOperations(input) {
  if (!input || typeof input !== 'object') throw new Error('운영 설정을 확인해 주세요.');
  const { tracks, bgmVolume, roomThemes, lobbyNotice } = input;
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
  return { tracks:[...tracks], bgmVolume, roomThemes:themes, lobbyNotice:lobbyNotice.trim() };
}
