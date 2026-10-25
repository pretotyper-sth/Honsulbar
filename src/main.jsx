import {visibleCheck,captureFacePair,profileCanSave} from './photo-verification';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IAP, loadFullScreenAd, showFullScreenAd, SafeAreaInsets, NavigationBar } from '@apps-in-toss/web-framework';
import { Button, BottomSheet, Badge, FaceConsent, CameraVerificationStatus } from './ui';
import { ArrowLeft, ArrowRight, Bell, Camera, Check, ChevronDown, Clock3, DoorOpen, Coins, MessageCircleMore, Mic, MicOff, Plus, Volume2, VolumeX, Speaker, Wine, X, Flag, Wallet, Eye, LockKeyhole, ArrowLeftRight, Settings, UserRound } from 'lucide-react';
import { REGIONS, CAPACITY, DRINKS } from './model';
import { useVoice } from './useVoice';
import { voicePeerIds } from './social';
import { useMesh } from './useMesh';
import { VOICE_CONSENT_VERSION } from './voice-evidence';
import { call, getConfig, login, clearSession, hasSession, assetUrl, insideToss, requestPushAgreement } from './api';
import { Glass } from './Glass';
import { SEATS as positions, POINT_PACKS, SUBSCRIPTIONS, adjacent, audioGain } from './social';
import { AdminPage } from './admin';
import './style.css';

const IAP_PACK_SKU = {
  1000: 'ait.0000078228.10e9c057.abb16a92b7.0232936136',
  3300: 'ait.0000078228.6ec058de.36dbc34bc4.0233037038',
  6000: 'ait.0000078228.f9cd1a54.c3649ea495.0233080906',
  10000: 'ait.0000078228.fd822515.cc48bf218d.0233160336',
  20000: 'ait.0000078228.8b1b9cbd.8529f22c7a.0233188045',
};
const IAP_SUB_SKU = 'sub.1od0.muf71ewh.de9ba197b4';

function Waves() { return <span className="waves" aria-hidden="true"><i/><i/><i/><i/></span>; }
const FAQ_ITEMS = [
  ['입장하면 포인트가 얼마 차감되나요?', '첫 입장은 선택한 음료에 따라 차감돼요. 기본 음료는 500P로 30분 이용할 수 있고, 입장 후 한 잔 더 주문해 시간을 연장할 수 있어요.'],
  ['바를 나가면 남은 시간이 어떻게 되나요?', '바를 나가도 같은 호점의 이용시간은 계속 흘러요. 자리가 있으면 남은 시간으로 다시 들어갈 수 있고, 다른 호점은 새로 입장해야 해요.'],
  ['입장 전에 손님 사진을 볼 수 있나요?', '미리보기 상품을 구매하면 현재 호점에 있는 손님들의 사진을 확인할 수 있어요. 미리보기는 입장이나 자리 예약을 포함하지 않아요.'],
  ['목소리가 불편한 손님은 어떻게 신고하나요?', '손님 프로필에서 신고를 선택하고 사유와 내용을 접수해 주세요. 신고한 손님의 목소리는 바로 들리지 않고, 서로 상대가 있는 바에는 입장할 수 없어요.'],
  ['정기 구독은 어떻게 해지하나요?', '토스 결제 내역에서 구독을 해지해 주세요. 해지 후에도 남은 기간은 이용할 수 있어요. 같은 화면에서 자동 결제를 다시 켤 수 있어요.'],
  ['빈자리 알림은 어떻게 끄나요?', '설정 알림에서 빈자리 알림 스위치를 끄면 신청한 호점 알림이 해제돼요. 토스 푸시 자체를 끄려면 토스 앱 알림 설정에서 바꿀 수 있어요.'],
  ['회원탈퇴는 어떻게 하나요?', '정기 구독이 유지 중이면 탈퇴할 수 없어요. 토스 결제 내역에서 구독을 먼저 해지한 뒤 설정에서 탈퇴해 주세요.'],
];
const LEGAL_DOCS = [
  ['이용약관', '/legal/terms.html'],
  ['개인정보처리방침', '/legal/privacy.html'],
  ['커뮤니티 운영정책', '/legal/community.html'],
  ['결제·환불 정책', '/legal/refund.html'],
  ['성인 이용·청소년 보호', '/legal/age-safety.html'],
  ['모니터링 및 대응 정책', '/legal/monitoring.html'],
];
const REGION_REQUEST_GROUPS = [
  {title:'광역시·특별자치도', options:['광주','울산','세종','제주']},
  {title:'경기 도시', options:['고양','구리','군포','김포','부천','성남','수원','시흥','안산','안양','용인','의정부']},
  {title:'주요 도시', options:['강릉','김해','목포','양산','여수','원주','익산','전주','진주','창원','천안','청주','춘천','포항']},
];
const DAILY_SWAP_REWARD_LIMIT = 3;
const DAILY_SWAP_REQUEST_LIMIT = 5;
const NICKNAME_ADJECTIVES = ['느긋한','말랑한','반짝이는','조용한','포근한','신나는','담백한','달빛','차분한','몽글한'];
const NICKNAME_NOUNS = ['토끼','고양이','감자','잔','구름','여우','오렌지','달팽이','치즈','산책러'];
const BLOCKED_NICKNAME_WORDS = ['관리자','운영자','혼술바','토스','고객센터','섹스','조건만남'];
function validateNickname(value) {
  const nickname = value.trim();
  if (!nickname) return '닉네임을 입력해 주세요.';
  if (nickname.length < 2 || nickname.length > 16) return '닉네임은 2~16자로 입력해 주세요.';
  if (!/^[가-힣a-zA-Z0-9 ]+$/.test(nickname)) return '한글, 영문, 숫자와 띄어쓰기만 사용할 수 있어요.';
  if (BLOCKED_NICKNAME_WORDS.some(word => nickname.toLowerCase().includes(word.toLowerCase()))) return '사용할 수 없는 단어가 포함되어 있어요.';
  return '';
}
function randomNickname() {
  return `${NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)]} ${NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)]}`;
}
function faceBox(face) {
  const topLeft = face.topLeft || face.box?.topLeft || [face.box?.xMin || 0, face.box?.yMin || 0];
  const bottomRight = face.bottomRight || face.box?.bottomRight || [face.box?.xMax || 0, face.box?.yMax || 0];
  return { left: Number(topLeft[0]), top: Number(topLeft[1]), width: Math.max(1, Number(bottomRight[0]) - Number(topLeft[0])), height: Math.max(1, Number(bottomRight[1]) - Number(topLeft[1])) };
}
function faceIsWellFramed(face, width, height) {
  const box = faceBox(face);
  const centerX = (box.left + box.width / 2) / width;
  const centerY = (box.top + box.height / 2) / height;
  const size = Math.min(box.width / width, box.height / height);
  return centerX > 0.2 && centerX < 0.8 && centerY > 0.2 && centerY < 0.8 && size > 0.18 && size < 0.82;
}
function faceProbability(face) {
  const raw = face?.probability;
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'number') return raw[0];
  try {
    if (raw && typeof raw.dataSync === 'function') return Number(raw.dataSync()[0]);
  } catch {}
  return NaN;
}
function isLikelyRealFace(face, width, height) {
  const box = faceBox(face);
  const probability = faceProbability(face);
  if (!Number.isFinite(probability) || probability < 0.85) return false;
  if (box.width / width < 0.18 || box.height / height < 0.22) return false;
  if (box.width / box.height < 0.5 || box.width / box.height > 1.5) return false;
  const [rightEye, leftEye, nose, mouth] = face.landmarks || [];
  if (![rightEye, leftEye, nose, mouth].every(point => Array.isArray(point) && point.every(Number.isFinite))) return false;
  const eyeY = (rightEye[1] + leftEye[1]) / 2;
  const eyeDistance = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]);
  return eyeDistance > box.width * 0.2 && eyeDistance < box.width * 0.75
    && nose[1] > eyeY && mouth[1] > nose[1] && mouth[1] - eyeY > box.height * 0.15;
}
function faceRegionLooksLikeSkin(canvas, face) {
  const stats = regionStats(canvas, cheekRect(face)) || regionStats(canvas, innerFaceRect(face));
  if (!stats) return false;
  const mean = (stats.meanR + stats.meanG + stats.meanB) / 3;
  if (mean < 18 || mean > 250) return false;
  if (stats.meanB > stats.meanR + 28) return false;
  return true;
}
function innerFaceRect(face) {
  const box = faceBox(face);
  const landmarks = face.landmarks || [];
  const [rightEye, leftEye, , mouth] = landmarks;
  if (rightEye && leftEye && mouth) {
    const eyeY = (rightEye[1] + leftEye[1]) / 2;
    return {
      x: Math.min(rightEye[0], leftEye[0]) - box.width * 0.14,
      y: eyeY - box.height * 0.2,
      w: Math.abs(leftEye[0] - rightEye[0]) + box.width * 0.28,
      h: (mouth[1] - eyeY) + box.height * 0.22,
    };
  }
  return { x: box.left + box.width * 0.16, y: box.top + box.height * 0.08, w: box.width * 0.68, h: box.height * 0.48 };
}
function regionStats(canvas, rect) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(8, Math.min(canvas.width - x, Math.floor(rect.w)));
  const h = Math.max(8, Math.min(canvas.height - y, Math.floor(rect.h)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let pixels;
  try { pixels = ctx.getImageData(x, y, w, h).data; } catch { return null; }
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  let samples = 0, flat = 0, exact = 0, ink = 0, graySum = 0, graySq = 0, rSum = 0, gSum = 0, bSum = 0, lapSum = 0;
  const colors = new Set();
  for (let row = 1; row < h - 1; row += step) {
    for (let col = 1; col < w - 1; col += step) {
      const i = (row * w + col) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const rightI = i + 4, downI = i + w * 4;
      const colorDelta = Math.abs(r - pixels[rightI]) + Math.abs(g - pixels[rightI + 1]) + Math.abs(b - pixels[rightI + 2]);
      const grayRight = 0.299 * pixels[rightI] + 0.587 * pixels[rightI + 1] + 0.114 * pixels[rightI + 2];
      const grayDown = 0.299 * pixels[downI] + 0.587 * pixels[downI + 1] + 0.114 * pixels[downI + 2];
      const left = 0.299 * pixels[i - 4] + 0.587 * pixels[i - 3] + 0.114 * pixels[i - 2];
      const up = 0.299 * pixels[i - w * 4] + 0.587 * pixels[i - w * 4 + 1] + 0.114 * pixels[i - w * 4 + 2];
      const lap = Math.abs(4 * gray - left - grayRight - up - grayDown);
      rSum += r; gSum += g; bSum += b;
      graySum += gray; graySq += gray * gray;
      lapSum += lap;
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (Math.abs(gray - grayRight) + Math.abs(gray - grayDown) < 6) flat += 1;
      if (colorDelta <= 3) exact += 1;
      if (gray < 70 && lap > 40) ink += 1;
      samples += 1;
    }
  }
  if (samples < 30) return null;
  return {
    samples,
    flatRatio: flat / samples,
    exactRatio: exact / samples,
    colorDensity: colors.size / samples,
    inkRatio: ink / samples,
    lapMean: lapSum / samples,
    std: Math.sqrt(Math.max(0, graySq / samples - (graySum / samples) ** 2)),
    meanR: rSum / samples,
    meanG: gSum / samples,
    meanB: bSum / samples,
  };
}
function cheekRect(face) {
  const box = faceBox(face);
  const landmarks = face.landmarks || [];
  const [, , nose, mouth] = landmarks;
  if (nose && mouth) {
    return {
      x: nose[0] - box.width * 0.2,
      y: nose[1] + box.height * 0.04,
      w: box.width * 0.4,
      h: Math.max(8, mouth[1] - nose[1] + box.height * 0.04),
    };
  }
  return { x: box.left + box.width * 0.28, y: box.top + box.height * 0.42, w: box.width * 0.44, h: box.height * 0.16 };
}
function cornerBackgroundStats(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const n = Math.max(10, Math.floor(Math.min(canvas.width, canvas.height) / 12));
  const spots = [[0, 0], [canvas.width - n, 0], [0, canvas.height - n], [canvas.width - n, canvas.height - n]];
  const stds = [];
  for (const [x, y] of spots) {
    let pixels;
    try { pixels = ctx.getImageData(Math.max(0, x), Math.max(0, y), n, n).data; } catch { continue; }
    let sum = 0, sq = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      sum += gray; sq += gray * gray; count += 1;
    }
    if (count) {
      const mean = sum / count;
      stds.push(Math.sqrt(Math.max(0, sq / count - mean * mean)));
    }
  }
  if (!stds.length) return { minStd: 99 };
  return { minStd: Math.min(...stds) };
}
function looksLikeIllustration(canvas, face) {
  const box = faceBox(face);
  const faceStats = regionStats(canvas, innerFaceRect(face));
  const cheekStats = regionStats(canvas, cheekRect(face)) || faceStats;
  const outlineStats = regionStats(canvas, { x: box.left - box.width * 0.06, y: box.top - box.height * 0.06, w: box.width * 1.12, h: box.height * 1.12 });
  if (!faceStats || !cheekStats) return false;
  const ink = Math.max(faceStats.inkRatio || 0, outlineStats?.inkRatio || 0);
  const lineArt = ink >= 0.03 && cheekStats.flatRatio >= 0.48 && cheekStats.colorDensity < 0.055;
  const celShade = ink >= 0.028 && cheekStats.exactRatio >= 0.32 && cheekStats.colorDensity < 0.05 && cornerBackgroundStats(canvas).minStd < 2.5;
  return lineArt || celShade;
}
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요. 다시 골라 주세요.')); };
    image.src = url;
  });
}
const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const WAITLIST_ALERT_KEY = 'honsulbar:alerts:waitlist:v1';
const PUSH_AGREED_KEY = 'honsulbar:push-agreed:v1';
function storageFlag(key) { try { return localStorage.getItem(key) === '1'; } catch { return false; } }
function setStorageFlag(key, on) { try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch {} }

function App() {
  const [config, setConfig] = useState(null);
  const [server, setServer] = useState(null);
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const [screen, setScreen] = useState(() => hasSession() ? 'loading' : 'onboarding');
  const [busy, setBusy] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [entryRoom, setEntryRoom] = useState(null);
  const [shopPack, setShopPack] = useState(POINT_PACKS[0]);
  const [historyLimit, setHistoryLimit] = useState(10);
  const historyLimitRef = useRef(10);
  historyLimitRef.current = historyLimit;
  const [waitlistAlerts, setWaitlistAlerts] = useState(() => storageFlag(WAITLIST_ALERT_KEY));
  const [pushAgreed, setPushAgreed] = useState(() => storageFlag(PUSH_AGREED_KEY));
  const [facing, setFacing] = useState(0);
  const [audioFacing, setAudioFacing] = useState(0);
  const [waveSent, setWaveSent] = useState([]);
  const [focusSubscription, setFocusSubscription] = useState(false);
  const [region, setRegion] = useState('서울');
  const [sheet, setSheetState] = useState(null);
  const [previewRoom, setPreviewRoom] = useState(null);
  const [previews, setPreviews] = useState({});
  const [profile, setProfile] = useState({ nickname: '', gender: null, photo: null });
  const [photoDraft, setPhotoDraft] = useState(null);
  const [draftVerified, setDraftVerified] = useState(false);
  const [faceConsent, setFaceConsent] = useState(false);
  const faceConsentRef = useRef(false);
  const verificationAttempt = useRef(0);
  const captureLock = useRef(false);
  const [photoProof, setPhotoProof] = useState(null);
  function changeFaceConsent(value) {
    faceConsentRef.current = value; setFaceConsent(value);
    if (!value) {
      verificationAttempt.current++; verificationController.current?.abort(); captureLock.current=false; setPhotoProof(null); setDraftVerified(false); setVerificationGuide({stage:'ready',progress:0});
      if (verificationState==='checking') setVerificationState('ready');
      setVerificationMessage('동의 해제 시 다시 촬영해야 해요.');
    } else if (verificationState==='verified' && !photoProof) { setVerificationState('ready'); setVerificationGuide({stage:'ready',progress:0}); setVerificationMessage('준비되면 촬영 시작을 눌러 주세요.'); }
  }
  const [photoCheck, setPhotoCheck] = useState('idle');
  const [devSubscription, setDevSubscription] = useState(null);
  const [verificationState, setVerificationState] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationGuide, setVerificationGuide] = useState({stage:'ready',progress:0});
  const [verificationStartedAt, setVerificationStartedAt] = useState(0);
  const verificationController = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState('highball');
  const [speaker, setSpeaker] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [mutedGuests, setMutedGuests] = useState([]);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [pendingSeat, setPendingSeat] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [inquiryType, setInquiryType] = useState('이용 방법 문의');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [voiceAgreed, setVoiceAgreed] = useState(false);
  const [voiceConsentChecked, setVoiceConsentChecked] = useState(false);
  const [attachVoice, setAttachVoice] = useState(true);
  const [reportAudio, setReportAudio] = useState(null);
  useEffect(()=>{
    const clear=()=>{if(document.hidden)setReportAudio(null);};
    document.addEventListener('visibilitychange',clear);return()=>document.removeEventListener('visibilitychange',clear);
  },[]);
  useEffect(()=>{if(sheet!=='report')setReportAudio(null);},[sheet]);
  const [reportReason, setReportReason] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [openFaq, setOpenFaq] = useState(null);
  const [adInProgress, setAdInProgress] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [requestedRegion, setRequestedRegion] = useState('');
  const [customRegion, setCustomRegion] = useState('');
  const [showCustomRegion, setShowCustomRegion] = useState(false);
  const [newRoom, setNewRoom] = useState(null);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [legalSrc, setLegalSrc] = useState('/legal/terms.html');
  const upload = useRef(null);
  const cameraVideo = useRef(null);
  const cameraCanvas = useRef(null);
  const cameraView = useRef(null);
  const cameraStream = useRef(null);
  const cameraDraw = useRef(0);
  const photoInspect = useRef(0);
  const subscriptionSection = useRef(null);
  const cueContext = useRef(null);
  const orderLock = useRef(false);
  const previewLock = useRef(false);
  const polling = useRef(false);
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const signalCursor = useRef(0);
  const previousState = useRef(null);
  const leaving = useRef(false);
  const entering = useRef(false);
  const pendingMove = useRef(null);
  const freezeTimer = useRef(0);
  const moveLockUntil = useRef(0);
  const [seatFrozen, setSeatFrozen] = useState(false);
  const stateHandler = useRef(null);
  const sheetStack = useRef([]);

  function setSheet(value) {
    if(value === 'report') { setReportAudio(mesh.evidenceFor(selectedGuest?.id)); setAttachVoice(true); }
    if(value == null && sheet === 'report') setReportAudio(null);
    if (value == null) {
      sheetStack.current = [];
      setSheetState(null);
      return;
    }
    setSheetState(() => {
      const idx = sheetStack.current.lastIndexOf(value);
      if (idx !== -1) sheetStack.current = sheetStack.current.slice(0, idx);
      return value;
    });
  }
  function open(value) {
    setError('');
    orderLock.current = false;
    setSheetState(current => {
      if (!value || value === current) return current;
      const idx = sheetStack.current.lastIndexOf(value);
      if (idx !== -1) {
        sheetStack.current = sheetStack.current.slice(0, idx);
        return value;
      }
      if (current) sheetStack.current = [...sheetStack.current, current];
      return value;
    });
  }
  function closeSheet() {
    if(sheet==='voice-consent' && busy)return;
    if(sheet==='voice-consent' && screen==='bar') { setPendingEntry(null);setSheet(null);run('leave').catch(fail);return; }
    setError('');
    setSheetState(() => sheetStack.current.pop() ?? null);
  }

  const member = server?.member || null;
  const me = member?.id;
  useEffect(()=>{setVoiceAgreed(false);setReportAudio(null);},[me]);
  const myPhoto = assetUrl(member?.photo) || null;
  const visit = server?.visit || null;
  const inside = !!(visit && !visit.away);
  const leftover = visit?.away && visit.seconds > 0 ? visit : null;
  const elapsed = Math.max(0, Math.floor((now - syncedAt) / 1000));
  const tick = (value, host) => host ? value : Math.max(0, value - elapsed);
  const seat = visit?.seat ?? 0;
  const guests = useMemo(() => (server?.guests || []).map(g => ({ ...g, photo: assetUrl(g.photo) })), [server?.guests]);
  const room = inside ? { region: visit.region, number: visit.number, count: guests.length + 1 } : entryRoom;
  const rooms = useMemo(() => {
    const grouped = Object.fromEntries(REGIONS.map(r => [r, []]));
    for (const r of server?.rooms || []) (grouped[r.region] ||= []).push({ number: r.number, count: r.count, hasReportedGuest: !!r.hasReportedGuest });
    for (const r of Object.keys(grouped)) { if (!grouped[r].length) grouped[r] = [{ number: 1, count: 0 }]; grouped[r].sort((a, b) => a.number - b.number); }
    return grouped;
  }, [server?.rooms]);
  const partners = useMemo(() => {
    const result = {};
    for (const [a, b] of Object.entries(server?.partners || {})) result[a === me ? 'me' : a] = b === me ? 'me' : b;
    return result;
  }, [server?.partners, me]);
  const activeFocus = partners.me;
  const neighbors = guests.filter(g => adjacent(seat, g.seat));
  const seconds = visit ? tick(visit.seconds, visit.seat === 11 && inside) : 0;
  const voice = useVoice(screen === 'bar', setToast, seconds > 0 || seat === 11);
  const pendingRequests = server?.requests || [];
  const incomingRequest = pendingRequests.find(r => r.receiver === me && r.kind === 'swap');
  const incoming = incomingRequest ? { id: incomingRequest.id, guestId: incomingRequest.sender, expiresAt: Date.parse(incomingRequest.expires_at) } : null;
  const incomingFocus = pendingRequests.find(r => r.receiver === me && r.kind === 'focus') || null;
  const outgoing = pendingRequests.find(r => r.sender === me && r.kind === 'swap') || null;
  const focusRequest = pendingRequests.find(r => r.sender === me && r.kind === 'focus') || null;
  const incomingSeconds = incoming ? Math.max(0, Math.ceil((incoming.expiresAt - now) / 1000)) : 0;
  const reportedIds = useMemo(() => new Set(server?.reportedIds || []), [server?.reportedIds]);
  const wallet = { balance: member?.balance ?? 0, drinkId: visit?.drinkId ?? null, attendanceDate: server?.attendanceDate ?? null };
  const currentDrink = DRINKS.find(d => d.id === wallet.drinkId);
  const chosen = DRINKS.find(d => d.id === selection);
  const isWelcome = sheet === 'welcome';
  const price = chosen.price;
  const previewKey = previewRoom ? `${previewRoom.region}:${previewRoom.number}` : null;
  const purchasedPreview = previews[previewKey];
  const dailySwapRewards = server?.swapRewardsToday ?? 0;
  const dailySwapRequests = server?.swapRequestsToday ?? 0;
  const seatRequestCounts = useMemo(() => Object.fromEntries((server?.requestedSeats || []).map(key => [key, 1])), [server?.requestedSeats]);
  const waitlist = server?.waitlist || [];
  const notifications = useMemo(() => (server?.notifications || []).map(n => ({ id: n.id, type: n.kind, title: n.title, body: n.body, unread: !n.read_at, inquiryId: n.data?.inquiryId, region: n.data?.region, number: n.data?.number })), [server?.notifications]);
  const inquiries = useMemo(() => (server?.inquiries || []).map(t => ({ id: t.id, type: t.category, message: t.message, answer: t.answer, createdAt: Date.parse(t.created_at) })), [server?.inquiries]);
  const ledger = useMemo(() => (server?.ledger || []).map(l => ({ id: l.id, label: l.label, amount: l.amount, date: Date.parse(l.created_at) })), [server?.ledger]);
  const ledgerCount = server?.ledgerCount ?? ledger.length;
  const profileVerified = !!profile.photo && (photoDraft ? draftVerified && faceConsent && !!photoProof : !!member?.photoChecked);
  const nicknameError = validateNickname(profile.nickname || '');
  const subscription = !!member?.subscribed || !!devSubscription;
  const subscriptionCancelAt = member?.subscribed
    ? (member.subAutoRenew === false ? (member.subExpiresAt || null) : null)
    : (devSubscription?.cancelAt ? (devSubscription.expiresAt || null) : null);
  const gains = useMemo(() => Object.fromEntries(guests.map(g => {
    if (!soundOn || mutedGuests.includes(g.id)) return [g.id, 0];
    const broadcast = g.speaker && !partners.me && !partners[g.id];
    return [g.id, broadcast ? 1 : audioGain({ id: 'me', seat }, g, audioFacing, partners, mutedGuests)];
  })), [guests, soundOn, mutedGuests, partners, seat, audioFacing]);
  const iceServers = useMemo(() => config?.iceServers?.length ? config.iceServers : DEFAULT_ICE, [config]);
  const sending = voice.mic && (seconds > 0 || seat === 11) ? voice.stream : null;
  const mesh = useMesh({ enabled: screen === 'bar' && !!me && !!member?.photoChecked && !server?.safetyPaused && (!config?.voiceEvidenceReady || voiceAgreed), evidenceEnabled: !!config?.voiceEvidenceReady && voiceAgreed, selfId: me, peerIds: voicePeerIds(guests,partners,reportedIds), stream: sending, iceServers, gains });
  const speakingGuest = mesh.talking.find(id => guests.some(g => g.id === id)) || null;
  const guest = guests.find(g => g.id === speakingGuest);

  stateHandler.current = (state, fresh) => {
    const fresher = state.signals?.filter(s => s.id > signalCursor.current) || [];
    if (fresher.length) {
      signalCursor.current = Math.max(...fresher.map(s => s.id));
      const ids = new Set((state.guests || []).map(g => g.id));
      mesh.receive(fresher.filter(s => ids.has(s.sender)));
    }
    if (!fresh) return;
    if (entering.current && !(state.visit && !state.visit.away)) { setScreen('bar'); return; }
    if (leaving.current && state.visit && !state.visit.away) { setScreen('lobby'); return; }
    const target = pendingMove.current;
    if (target != null && state.visit && state.visit.seat !== target) {
      state = { ...state, visit: { ...state.visit, seat: target } };
    }
    const before = previousState.current;
    const wanted = historyLimitRef.current;
    const incoming = state.ledger || [];
    const existing = before?.ledger || [];
    if (incoming.length < wanted && existing.length > incoming.length) {
      const seen = new Set(incoming.map(item => item.id));
      state = { ...state, ledger: [...incoming, ...existing.filter(item => !seen.has(item.id))].slice(0, wanted) };
    }
    previousState.current = state;
    setServer(state); setSyncedAt(Date.now()); setNow(Date.now());
    setScreen(current => {
      if (!['loading', 'onboarding', 'lobby', 'bar'].includes(current)) return current;
      if (leaving.current) return 'lobby';
      if (entering.current) return 'bar';
      return state.visit && !state.visit.away ? 'bar' : 'lobby';
    });
    if (!before) return;
    if (before.visit && !before.visit.away && !state.visit && !leaving.current) { voice.stop(); setSpeaker(false); setSheet(null); setToast('이용시간이 끝나 바에서 나왔어요.'); }
    else if (before.visit?.away && !state.visit && !leaving.current) { setToast('남은 이용시간이 끝났어요.'); }
    const seen = new Set((before.notifications || []).map(n => n.id));
    const arrived = (state.notifications || []).filter(n => !seen.has(n.id) && !n.read_at);
    if (arrived.length) { setToast(arrived[0].title); playCue('notification'); }
    const incomingBefore = new Set((before.requests || []).filter(r => r.receiver === state.member?.id).map(r => r.id));
    if ((state.requests || []).some(r => r.receiver === state.member?.id && !incomingBefore.has(r.id))) playCue('request');
    const sent = (before.requests || []).find(r => r.sender === state.member?.id && r.kind === 'swap');
    if (sent && !(state.requests || []).some(r => r.id === sent.id)) {
      setToast(state.visit && before.visit && state.visit.seat !== before.visit.seat ? '500P를 쓰고 자리를 바꿨어요.' : '요청이 거절돼 포인트는 그대로예요.');
    }
    const partnerBefore = Object.keys(before.partners || {}).includes(state.member?.id);
    const partnerNow = Object.keys(state.partners || {}).includes(state.member?.id);
    if (!partnerBefore && partnerNow) setToast('옆자리와 대화를 시작했어요.');
    if (partnerBefore && !partnerNow) setToast('전체 대화로 돌아왔어요.');
  };

  async function run(action, data, extra = {}, options = {}) {
    const id = ++sequence.current;
    const response = await call(action, data, { after: signalCursor.current, limit: historyLimitRef.current, ...extra }, options);
    const fresh = id > appliedSequence.current;
    if (fresh) appliedSequence.current = id;
    if (response.state) stateHandler.current(response.state, fresh);
    return response.result;
  }
  function fail(e) {
    if (e?.status === 401) { clearSession(); setServer(null); previousState.current = null; setScreen('onboarding'); setSheet(null); }
    setToast(e?.message || '요청을 완료하지 못했어요.');
  }

  useEffect(() => {
    const mark = () => { if (insideToss()) document.documentElement.classList.add('in-toss'); };
    const apply = insets => {
      mark();
      if (!insideToss()) return;
      const top = Math.max(Number(insets?.top) || 0, 0);
      const chrome = top >= 80 ? top : Math.max(top, 44) + 48;
      document.documentElement.style.setProperty('--ait-chrome-top', `${chrome}px`);
    };
    mark();
    try { apply(SafeAreaInsets.get()); } catch {}
    let off = () => {};
    try { off = SafeAreaInsets.subscribe({ onEvent: apply }) || (() => {}); } catch {}
    return () => { try { off(); } catch {} };
  }, []);
  useEffect(() => {
    if (!insideToss() || typeof NavigationBar?.setOptions !== 'function') return;
    NavigationBar.setOptions({ transparentBackground: true, backgroundColor: sheet ? null : '#ffffff' }).catch(() => {});
  }, [sheet]);
  useEffect(() => { getConfig().then(setConfig).catch(() => setConfig({})); }, []);
  useEffect(() => {
    if(screen==='bar' && config?.voiceEvidenceReady && !voiceAgreed) { setPendingEntry(null);setSheetState('voice-consent'); }
  },[screen,config?.voiceEvidenceReady,voiceAgreed]);
  useEffect(() => {
    if (screen !== 'loading') return;
    run('state').then(() => restorePendingOrders()).catch(e => { if (e.status === 401) fail(e); else { setToast(e.message); setScreen('onboarding'); } });
  }, []);
  useEffect(() => {
    if (!['lobby', 'bar'].includes(screen)) return undefined;
    let stopped = false; let timer;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden && !polling.current && !entering.current && !leaving.current) {
        polling.current = true;
        try { await run(screen === 'bar' ? 'heartbeat' : 'state', screen === 'bar' ? { speaker, mic: voice.mic } : undefined); } catch (e) { if (e.status === 401) fail(e); }
        polling.current = false;
      }
      timer = setTimeout(loop, screen === 'bar' ? 1000 : 6000);
    };
    timer = setTimeout(loop, screen === 'bar' ? 400 : 6000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [screen, speaker, voice.mic]);
  useEffect(() => { if (['lobby', 'bar'].includes(screen)) run('state').catch(() => {}); }, [historyLimit]);
  useEffect(() => {
    if (waitlist.length && !waitlistAlerts) {
      setWaitlistAlerts(true);
      setStorageFlag(WAITLIST_ALERT_KEY, true);
      setPushAgreed(true);
      setStorageFlag(PUSH_AGREED_KEY, true);
    }
  }, [waitlist.length, waitlistAlerts]);

  const faceModel = useRef(null);
  const faceModelLoading = useRef(null);
  async function loadFaceModel() {
    if (faceModel.current) return faceModel.current;
    if (!faceModelLoading.current) faceModelLoading.current = (async () => {
      await import('@tensorflow/tfjs');
      const blazeface = await import('@tensorflow-models/blazeface');
      const model = await blazeface.load({scoreThreshold:0.85,maxFaces:3,modelUrl:'/face-screening-v1/model.json'});
      const warmup = document.createElement('canvas');warmup.width=128;warmup.height=128;
      await model.estimateFaces(warmup,false);
      return model;
    })().catch(error => { faceModelLoading.current = null; throw error; });
    faceModel.current = await faceModelLoading.current;
    return faceModel.current;
  }
  useEffect(() => {
    const timer=setTimeout(()=>loadFaceModel().catch(()=>{}),350);
    return ()=>clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (sheet === 'profile' || sheet === 'verify-profile') {
      loadFaceModel().catch(() => {});
      call('photo-prepare').catch(() => {});
    }
  }, [sheet]);

  function playCue(kind) {
    if (!soundOn || typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = cueContext.current || (cueContext.current = new AudioContext());
    context.resume?.();
    const tones = kind === 'request' ? [392, 523] : [523, 659, 784];
    tones.forEach((frequency, index) => {
      const start = context.currentTime + index * .09;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.08, start + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + .18);
    });
  }

  useEffect(() => { const timer=setTimeout(()=>setAudioFacing(facing),150); return ()=>clearTimeout(timer); },[facing]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => {
    let id = 0;
    const pulse = () => { setNow(Date.now()); id = window.setTimeout(pulse, 1000); };
    pulse();
    return () => clearTimeout(id);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!newRoom) return; const timer = setTimeout(() => setNewRoom(null), 6000); return () => clearTimeout(timer); }, [newRoom]);
  useEffect(() => {
    if (screen !== 'bar') return;
    const scroller = document.querySelector('.app');
    if (!scroller) return;
    scroller.style.overflow = '';
    scroller.scrollTop = 0;
  }, [screen]);
  useEffect(() => {
    if (sheet !== 'shop' || !focusSubscription) return;
    const timer = setTimeout(() => {
      subscriptionSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusSubscription(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [sheet, focusSubscription]);
  useEffect(() => {
    const stopPreview = () => {
      cancelAnimationFrame(cameraDraw.current);
      cameraDraw.current = 0;
      cameraStream.current?.getTracks().forEach(track => track.stop());
      cameraStream.current = null;
      const video = cameraVideo.current;
      if (video) { video.srcObject = null; video.removeAttribute('src'); }
    };
    if (sheet !== 'verify-profile') {
      stopPreview();
      const context = cameraCanvas.current?.getContext('2d');
      if (context && cameraCanvas.current) context.clearRect(0, 0, cameraCanvas.current.width, cameraCanvas.current.height);
      const view = cameraView.current?.getContext('2d');
      if (view && cameraView.current) view.clearRect(0, 0, cameraView.current.width, cameraView.current.height);
      return;
    }
    let cancelled = false;
    setVerificationState('starting');
    setVerificationGuide({stage:'prepare',progress:0});
    setVerificationStartedAt(Date.now());
    setVerificationMessage('카메라를 준비하고 있어요.');
    if (!navigator.mediaDevices?.getUserMedia) {
      setVerificationState('unavailable');
      setVerificationMessage('카메라를 지원하는 기기에서 확인해 주세요.');
      return undefined;
    }
    const paintPreview = () => {
      if (cancelled) return;
      const video = cameraVideo.current;
      const view = cameraView.current;
      if (video && view && video.readyState >= 2 && video.videoWidth) {
        if (view.width !== video.videoWidth || view.height !== video.videoHeight) {
          view.width = video.videoWidth;
          view.height = video.videoHeight;
        }
        view.getContext('2d')?.drawImage(video, 0, 0, view.width, view.height);
      }
      cameraDraw.current = requestAnimationFrame(paintPreview);
    };
    const prepareVideo = video => {
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.controls = false;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.setAttribute('muted', '');
      video.setAttribute('autoplay', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('disablepictureinpicture', '');
      video.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
      video.removeAttribute('controls');
    };
    const attachStream = stream => {
      if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      cameraStream.current?.getTracks().forEach(track => track.stop());
      cameraStream.current = stream;
      stream.getVideoTracks().forEach(track => {
        track.onended = () => { if (!cancelled) startCamera(); };
      });
      const video = cameraVideo.current;
      prepareVideo(video);
      if (video) {
        video.srcObject = stream;
        const playInline = () => {
          const run = video.play();
          if (run?.catch) run.catch(() => {});
          if (video.webkitDisplayingFullscreen) video.webkitExitFullScreen?.();
        };
        video.onloadedmetadata = playInline;
        playInline();
        video.addEventListener('webkitbeginfullscreen', event => {
          event.preventDefault();
          video.webkitExitFullScreen?.();
        });
      }
      cancelAnimationFrame(cameraDraw.current);
      cameraDraw.current = requestAnimationFrame(paintPreview);
      loadFaceModel().then(() => {
        if (!cancelled) { setVerificationState('ready'); setVerificationGuide({stage:'ready',progress:0}); setVerificationMessage('준비되면 촬영 시작을 눌러 주세요.'); }
      }).catch(() => {
        if (!cancelled) { setVerificationState('unavailable'); setVerificationMessage('얼굴 확인을 준비하지 못했어요. 다시 시도해 주세요.'); }
      });
    };
    const startCamera = () => navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    }).then(attachStream).catch(() => {
      if (!cancelled) {
        setVerificationState('unavailable');
        setVerificationMessage('카메라 권한을 허용해 주세요.');
      }
    });
    startCamera();
    return () => { cancelled = true; verificationAttempt.current++; verificationController.current?.abort(); captureLock.current=false; stopPreview(); };
  }, [sheet]);
  const previousRoomCount = useRef({ region, count: rooms[region].length });
  useEffect(() => {
    const previous = previousRoomCount.current;
    if (previous.region === region && rooms[region].length > previous.count) setNewRoom(rooms[region].at(-1).number);
    previousRoomCount.current = { region, count: rooms[region].length };
  }, [rooms, region]);
  useEffect(() => {
    if (screen === 'bar' && seconds === 0 && seat !== 11 && visit) { voice.stop(); setSpeaker(false); }
  }, [seconds, screen, seat, !!visit, voice.stop]);
  useEffect(() => {
    const ids = guests.filter(g => reportedIds.has(g.id)).map(g => g.id);
    if (!ids.length) return;
    setMutedGuests(v => ids.some(id => !v.includes(id)) ? [...new Set([...v, ...ids])] : v);
  }, [guests, reportedIds]);

  function formatHistoryDate(timestamp) { return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric'}).format(new Date(timestamp)); }
  async function restorePendingOrders() {
    if (!insideToss() || typeof IAP?.getPendingOrders !== 'function') return;
    try {
      const { orders = [] } = await IAP.getPendingOrders() || {};
      for (const order of orders) {
        try { await run('purchase', undefined, { orderId: order.orderId }); await IAP.completeProductGrant({ params: { orderId: order.orderId } }); } catch {}
      }
    } catch {}
  }
  async function completeOnboarding() {
    if (busy) return;
    setBusy(true);
    try {
      const state = await login(config || await getConfig().catch(() => ({})));
      appliedSequence.current = ++sequence.current;
      stateHandler.current(state, true);
      try { localStorage.setItem('honsulbar:onboarding:v1', 'done'); } catch {}
      if (!state.member?.photo) openProfileEditor(state.member);
      restorePendingOrders();
    } catch (e) { setToast(e?.message || '로그인하지 못했어요.'); }
    finally { setBusy(false); }
  }
  async function submitInquiry() {
    if (busy) return;
    setBusy(true);
    try {
      await run('ticket', { kind: inquiryType === '서비스 신고' ? 'report' : 'inquiry', category: inquiryType, message: inquiryMessage.trim() });
      setSheet(null); setInquiryMessage(''); setToast('문의 접수했고 답 오면 알려드릴게요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitReport() {
    if (busy || !selectedGuest) return;
    setBusy(true);
    try {
      await run('ticket', { kind: 'report', category: reportReason, message: reportMessage.trim() || reportReason, targetId: selectedGuest.id, ...(attachVoice && reportAudio ? {audioEvidence:reportAudio} : {}) });
      setReportAudio(null);
      if (activeFocus === selectedGuest.id) endFocus();
      setMutedGuests(v => [...new Set([...v, selectedGuest.id])]);
      setSheet(null); setToast('접수했어요. 상대와 다시 연결되지 않아요.'); setReportReason(''); setReportMessage('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitRegion() {
    const requested = (showCustomRegion ? customRegion : requestedRegion).trim();
    if (!requested) return;
    try {
      await run('region', { region: requested });
      setRequestedRegion(''); setCustomRegion(''); setShowCustomRegion(false); setSheet(null); setToast(`${requested} 추가 요청을 접수했어요.`);
    } catch (e) { setError(e.message); }
  }
  function openNotifications() {
    open('notifications');
    if (notifications.some(item => item.unread)) run('read').catch(() => {});
  }
  function openNotification(item) {
    if (item.type === 'inquiry') { setSelectedInquiry(inquiries.find(entry => entry.id === item.inquiryId) || null); open('inquiry-detail'); return; }
    if (item.region) { setRegion(item.region); setSelectedRoom({ region: item.region, number: item.number }); setSheet(null); setToast(`${item.region} ${item.number}호점을 선택했어요.`); return; }
    setSheet(null);
  }
  function resetConversation() { setFacing(0); setAudioFacing(0); }
  async function requestFocus(target) {
    if (!target || !adjacent(seat, target.seat) || partners[target.id] || mutedGuests.includes(target.id) || seconds === 0 || focusRequest || activeFocus) return;
    try { await run('request', { targetId: target.id, kind: 'focus' }); setSheet(null); setToast('옆자리와 대화를 요청했어요.'); }
    catch (e) { setError(e.message); }
  }
  function cancelFocus() { if (focusRequest) run('cancel', { id: focusRequest.id }).catch(fail); }
  function endFocus() { run('focus-end').catch(fail); }
  async function respondFocus(accept) {
    if (!incomingFocus) return;
    try { await run('respond', { id: incomingFocus.id, accept }); if (!accept) setToast('대화 요청을 거절했어요.'); }
    catch (e) { setToast(e.message); }
  }
  async function sendWave(target) {
    try { await run('request', { targetId: target.id, kind: 'wave' }); setWaveSent(v => [...v, target.id]); setToast('인사를 남겼어요.'); }
    catch (e) { setError(e.message); }
  }
  function pushTemplate() {
    return config?.pushAvailableTemplate || 'honsulbar-seat-open';
  }
  function agreementType(result) {
    return result?.type || result?.agreementResult || result;
  }
  function rememberPushAgreed() {
    setPushAgreed(true);
    setStorageFlag(PUSH_AGREED_KEY, true);
  }
  function rememberWaitlistAlerts(on) {
    setWaitlistAlerts(on);
    setStorageFlag(WAITLIST_ALERT_KEY, on);
  }
  function askPushAgreement() {
    return new Promise(resolve => {
      if (!insideToss()) { resolve('agreed'); return; }
      let settled = false;
      let cleanup = () => {};
      const done = value => { if (settled) return; settled = true; cleanup(); resolve(value); };
      const timer = setTimeout(() => done('skipped'), 20000);
      try {
        cleanup = requestPushAgreement(pushTemplate(), {
          onEvent: result => {
            clearTimeout(timer);
            const type = agreementType(result);
            done(type === 'newAgreement' || type === 'alreadyAgreed' ? 'agreed' : type === 'agreementRejected' ? 'rejected' : 'skipped');
          },
          onError: () => { clearTimeout(timer); done('skipped'); },
        });
      } catch { clearTimeout(timer); done('skipped'); }
    });
  }
  async function ensureWaitlistConsent() {
    if (pushAgreed) return 'agreed';
    const consent = await askPushAgreement();
    if (consent === 'agreed') rememberPushAgreed();
    return consent;
  }
  async function requestWaitlist(target) {
    const targetRegion = target.region || region;
    const key = `${targetRegion}:${target.number}`;
    if (sheet === 'preview') setSheet(null);
    if (waitlist.includes(key)) {
      try { await run('waitlist-off', { region: targetRegion, number: target.number }); setToast('빈자리 알림을 껐어요.'); }
      catch (e) { setToast(e.message); }
      return;
    }
    const consent = await ensureWaitlistConsent();
    if (consent === 'rejected') { setToast('알림에 동의해야 빈자리를 알려드려요.'); return; }
    if (consent === 'skipped' && !pushAgreed) { setToast('알림에 동의해야 빈자리를 알려드려요.'); return; }
    try {
      await run('waitlist', { region: targetRegion, number: target.number });
      rememberWaitlistAlerts(true);
      setToast('빈자리가 생기면 알려드릴게요.');
    } catch (e) { setToast(e.message); }
  }
  async function setWaitlistAlertEnabled(on) {
    if (!on) {
      rememberWaitlistAlerts(false);
      if (waitlist.length) {
        try { await run('waitlist-off'); } catch (e) { setToast(e.message); return; }
      }
      setToast('빈자리 알림을 껐어요.');
      return;
    }
    const consent = await ensureWaitlistConsent();
    if (consent === 'rejected') { setToast('알림에 동의해야 빈자리를 알려드려요.'); return; }
    if (consent === 'skipped' && !pushAgreed) { setToast('알림에 동의해야 빈자리를 알려드려요.'); return; }
    rememberWaitlistAlerts(true);
    setToast('빈자리 알림을 켰어요.');
  }
  async function attendance() {
    if (wallet.attendanceDate === today || adInProgress) return;
    setAdInProgress(true);
    let claim;
    try { claim = await run('ad-start'); } catch (e) { setAdInProgress(false); setToast(e.message); return; }
    let finished = false;
    const finish = async () => {
      if (finished) return; finished = true;
      try { await run('ad-claim', { id: claim.id }); setSheet('shop'); setToast('출석 포인트 1,000P를 받았어요.'); }
      catch (e) { setToast(e.message); }
      finally { setAdInProgress(false); }
    };
    const stop = message => { if (finished) return; finished = true; setAdInProgress(false); setToast(message); };
    const adGroupId = config?.adGroupId;
    if (adGroupId && loadFullScreenAd.isSupported?.() && showFullScreenAd.isSupported?.()) {
      setToast('광고를 불러오고 있어요.');
      let rewarded = false;
      loadFullScreenAd({
        options: { adGroupId },
        onEvent: event => {
          if (event.type !== 'loaded') return;
          showFullScreenAd({
            options: { adGroupId },
            onEvent: shown => {
              if (shown.type === 'userEarnedReward') { rewarded = true; finish(); }
              else if (shown.type === 'dismissed' && !rewarded) stop('광고를 끝까지 봐야 포인트를 받아요.');
              else if (shown.type === 'failedToShow') stop('광고를 불러오지 못했어요.');
            },
            onError: () => stop('광고를 불러오지 못했어요.'),
          });
        },
        onError: () => stop('광고를 불러오지 못했어요.'),
      });
    } else if (config?.devLogin) {
      setToast('테스트라 6초 뒤 출석 포인트가 들어와요.');
      setTimeout(finish, 6000);
    } else stop('광고를 준비하고 있어요.');
  }
  async function catalogSku(preferred, { points, subscription } = {}) {
    if (!preferred) return preferred;
    if (typeof IAP?.getProductItemList !== 'function') return preferred;
    try {
      const { products = [] } = await IAP.getProductItemList() || {};
      const exact = products.find(item => item.sku === preferred || item.productId === preferred);
      if (exact?.sku) return exact.sku;
      if (subscription) {
        const sub = products.find(item => item.type === 'SUBSCRIPTION' || String(item.sku || '').startsWith('sub.'));
        if (sub?.sku) return sub.sku;
      }
      if (points) {
        const digits = String(points);
        const won = String(POINT_PACKS.find(pack => pack.points === points)?.won || '');
        const named = products.find(item => {
          const name = String(item.displayName || '').replace(/[^\d]/g, '');
          const amount = String(item.displayAmount || '').replace(/[^\d]/g, '');
          return name === digits || (won && amount === won);
        });
        if (named?.sku) return named.sku;
      }
      return preferred;
    } catch { return preferred; }
  }
  function canceledPurchase(err) {
    const code = String(err?.code || '');
    const message = String(err?.message || err || '');
    return code === 'USER_CANCELED' || /cancel|canceled|CANCELED|USER_DECLINED|취소/i.test(message);
  }
  async function buyPoints() {
    if (server?.safetyPaused) { setToast('안전 점검 중에는 새 결제를 진행할 수 없어요.'); return; }
    const preferred = IAP_PACK_SKU[shopPack.points] || Object.entries(config?.products || {}).find(([, item]) => item.points === shopPack.points)?.[0];
    if (!preferred || !insideToss() || typeof IAP?.createOneTimePurchaseOrder !== 'function') { setToast('결제 상품을 준비하고 있어요.'); return; }
    if (busy) return;
    setBusy(true);
    setSheet(null);
    let cleanup;
    const done = () => { try { cleanup?.(); } catch {} setBusy(false); };
    try {
      await new Promise(resolve => setTimeout(resolve, 80));
      const sku = await catalogSku(preferred, { points: shopPack.points });
      cleanup = IAP.createOneTimePurchaseOrder({
        options: {
          sku,
          processProductGrant: async ({ orderId }) => { try { await run('purchase', undefined, { orderId }); return true; } catch { return false; } },
        },
        onEvent: event => {
          if (event.type === 'success' || event.type === 'purchased') {
            done();
            setSheet('shop');
            setToast(`${shopPack.points.toLocaleString()}P를 충전했어요.`);
          }
        },
        onError: err => { done(); if (!canceledPurchase(err)) setToast('결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); },
      });
    } catch { done(); setToast('결제를 시작하지 못했어요.'); }
  }
  function requestPreview(target) {
    if (rooms[target.region || region]?.find(r => r.number === target.number)?.hasReportedGuest) { setToast('이용자 보호를 위해 현재 이용할 수 없는 바예요.'); return; }
    const current = rooms[target.region || region]?.find(room => room.number === target.number) || target;
    if (!(current.count > 0)) return;
    setPreviewRoom({ ...target, region: target.region || region }); previewLock.current = false; open('preview');
  }
  async function buyPreview() {
    if (previewLock.current || previews[previewKey]) return;
    const current = rooms[previewRoom.region].find(r => r.number === previewRoom.number);
    if (!current?.count) { setError('손님이 없어 포인트를 사용하지 않았어요.'); return; }
    if (!subscription && wallet.balance < 500) { setError('500P가 필요해요. 자리 양보로 모아보세요.'); return; }
    previewLock.current = true;
    try {
      const list = await run('preview', { region: previewRoom.region, number: previewRoom.number });
      setPreviews(v => ({ ...v, [previewKey]: { guests: (list || []).map(g => ({ ...g, photo: assetUrl(g.photo) })), at: Date.now() } }));
      setToast(subscription ? '구독으로 손님을 확인해요.' : '500P로 손님을 확인해요.');
    } catch (e) { setError(e.message); }
    finally { previewLock.current = false; }
  }
  async function respondSwap(accept) {
    if (!incoming) return;
    try {
      await run('respond', { id: incoming.id, accept });
      setSheet(null);
      setToast(accept ? '자리를 양보하고 500P를 받았어요' : '요청을 거절했어요.');
    } catch (e) { setSheet(null); setToast(e.message); }
  }
  async function sendSeatRequest() {
    if (outgoing || !selectedGuest || wallet.balance < 500) return;
    if (dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT) { setToast('오늘은 자리 양보 요청을 더 보낼 수 없어요.'); return; }
    if (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`]) { setToast('같은 자리에는 한 번만 부탁할 수 있어요.'); return; }
    try { await run('request', { targetId: selectedGuest.id, kind: 'swap' }); setSheet(null); setToast('부탁했고 수락 시 500P가 사용돼요.'); }
    catch (e) { setError(e.message); }
  }
  function cancelOutgoing() { if (outgoing) run('cancel', { id: outgoing.id }).then(() => setToast('요청을 취소했어요.')).catch(fail); }
  function openProfileEditor(source = member) {
    setProfile({ nickname: source?.photo ? source.nickname : (source?.nickname && source.nickname !== '느긋한 구름' ? source.nickname : randomNickname()), gender: source?.gender || null, photo: assetUrl(source?.photo) || null });
    setPhotoDraft(null); setDraftVerified(false); setPhotoProof(null); changeFaceConsent(false); setPhotoCheck('idle');
    open('profile');
  }
  async function saveProfile() {
    if (busy || !profileCanSave({changed:!!photoDraft,consent:faceConsentRef.current,verified:draftVerified,proof:photoProof})) return;
    setBusy(true);
    try {
      await run('profile', { nickname: profile.nickname.trim(), gender: profile.gender, ...(photoDraft ? { photo: photoDraft, photoProof, faceConsent:faceConsentRef.current } : {}) });
      setPhotoDraft(null); setDraftVerified(false); setPhotoProof(null);
      setSheet(null); setToast('프로필을 저장했어요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function withdraw() {
    if (busy) return;
    if (subscription && !subscriptionCancelAt) {
      setError('정기 구독을 먼저 해지해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await run('withdraw');
      clearSession(); setServer(null); previousState.current = null; setSheet(null);
      try { localStorage.removeItem('honsulbar:onboarding:v1'); } catch {}
      setScreen('onboarding'); setToast('탈퇴가 완료됐어요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function openSubscriptionManager() { setFocusSubscription(true); open('shop'); }
  function requestSubscriptionChange() { open(subscription ? 'subscription-cancel-guide' : 'subscription-confirm'); }
  function startSubscription() {
    if (server?.safetyPaused) { setToast('안전 점검 중에는 새 결제를 진행할 수 없어요.'); return; }
    const localPreview = !insideToss() && (config?.devLogin || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
    if (localPreview) {
      setDevSubscription({ expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), cancelAt: null });
      setSheet('shop');
      setToast('테스트로 정기 구독을 시작했어요.');
      return;
    }
    const preferred = (config?.subscriptionSku?.startsWith('sub.') ? config.subscriptionSku : IAP_SUB_SKU);
    if (!insideToss() || typeof IAP?.createSubscriptionPurchaseOrder !== 'function') { setToast('정기 구독을 준비하고 있어요.'); return; }
    if (busy) return;
    setBusy(true);
    setSheet(null);
    let cleanup;
    const done = () => { try { cleanup?.(); } catch {} setBusy(false); };
    (async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 80));
        const sku = await catalogSku(preferred, { subscription: true });
        cleanup = IAP.createSubscriptionPurchaseOrder({
          options: {
            sku,
            processProductGrant: async ({ orderId }) => { try { await run('purchase', undefined, { orderId }); return true; } catch { return false; } },
          },
          onEvent: event => { if (event.type === 'success' || event.type === 'purchased') { done(); setSheet('shop'); setToast('구독을 시작해 입장·연장이 무료예요.'); } },
          onError: err => { done(); if (!canceledPurchase(err)) setToast('구독을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); },
        });
      } catch { done(); setToast('구독을 시작하지 못했어요.'); }
    })();
  }
  function confirmSubscriptionChange() {
    if (!subscription) { startSubscription(); return; }
    setSheet('shop');
    setToast(subscriptionCancelAt ? '토스 결제 내역에서 다시 켤 수 있어요.' : '토스 결제 내역에서 해지하면 반영돼요.');
  }
  function subscriptionEndLabel() {
    const expiresAt = member?.subExpiresAt || devSubscription?.expiresAt;
    if (!expiresAt) return '이용 기간이 끝날 때';
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(expiresAt));
  }
  function leftoverFor(target) {
    return leftover && leftover.region === (target.region || region) && leftover.number === target.number;
  }
  async function rejoinRoom(target) {
    entering.current = true;
    setSheet(null);
    setServer(s => s?.visit ? { ...s, visit: { ...s.visit, away: false } } : s);
    setScreen('bar');
    resetConversation(); setWaveSent([]); setSpeaker(false); setSoundOn(true); setMutedGuests([]);
    setToast('남은 시간으로 다시 들어왔어요.');
    try { await run('enter', { region: target.region || region, number: target.number }); }
    catch (e) {
      setServer(s => s?.visit ? { ...s, visit: { ...s.visit, away: true } } : s);
      setScreen('lobby');
      setToast(e.message);
    }
    finally { entering.current = false; }
  }
  async function revokeVoiceConsent() {
    if(busy)return;
    setVoiceAgreed(false);setReportAudio(null);voice.stop();setBusy(true);
    try {await run('voice-consent-revoke');setSheet(null);setToast('동의를 철회했어요. 음성 대화를 종료했어요.');}
    catch(error){fail(error);}finally{setBusy(false);}
  }
  async function agreeVoice() {
    if (!voiceConsentChecked || busy) return;
    setBusy(true);
    try {
      await run('voice-consent', {agreed:true,version:VOICE_CONSENT_VERSION});
      setVoiceAgreed(true);setSheet(null);
      if(pendingEntry)proceedEntry(pendingEntry,{consented:true});
    } catch(error) { fail(error); } finally { setBusy(false); }
  }
  function proceedEntry(target, { confirm, consented } = {}) {
    if(config?.voiceEvidenceReady && !voiceAgreed && !consented) { setPendingEntry(target); setVoiceConsentChecked(false); open('voice-consent'); return; }
    setPendingEntry(null);
    setEntryRoom({ region: target.region || region, number: target.number, count: target.count });
    if (!member?.photo || !member?.gender) { openProfileEditor(); return; }
    if (leftoverFor(target)) {
      if (confirm) open('rejoin');
      else rejoinRoom(target);
      return;
    }
    setSelection('highball'); open('welcome');
  }
  function requestEntry(target, { confirm } = {}) {
    if (!target) return;
    const regionKey = target.region || region;
    target = rooms[regionKey]?.find(r => r.number === target.number) || { ...target, region: regionKey };
    if ((target.count ?? 0) >= CAPACITY) return;
    if (target.hasReportedGuest) { setToast('이용자 보호로 입장이 제한된 바예요.'); return; }
    proceedEntry({ ...target, region: regionKey }, { confirm });
  }
  async function confirmOrder() {
    if (orderLock.current) return;
    orderLock.current = true; setError('');
    const welcome = isWelcome;
    const previous = server;
    if (welcome) {
      entering.current = true;
      const taken = new Set((server?.guests || []).map(g => g.seat));
      let seatGuess = 0;
      for (let i = 0; i < 12; i++) { if (!taken.has(i)) { seatGuess = i; break; } }
      setSheet(null);
      setServer(s => ({
        ...s,
        visit: { region: room.region, number: room.number, drinkId: selection, seconds: chosen.minutes * 60, seat: seatGuess, away: false },
        member: s?.member && !subscription ? { ...s.member, balance: Math.max(0, (s.member.balance ?? 0) - price) } : s?.member,
      }));
      setScreen('bar');
      resetConversation(); setWaveSent([]); setSpeaker(false); setSoundOn(true); setMutedGuests([]);
      mesh.resume();
    }
    try {
      if (welcome) await run('enter', { region: room.region, number: room.number, drinkId: selection });
      else {
        await run('order', { drinkId: selection });
        setSheet(null);
      }
      setToast(welcome ? `${chosen.name} ${chosen.minutes}분으로 시작했어요.` : `${chosen.minutes}분 연장했어요.`);
    } catch (e) {
      if (welcome) {
        setServer(previous);
        setScreen('lobby');
        open('welcome');
      }
      setError(e.message);
    }
    finally {
      orderLock.current = false;
      entering.current = false;
    }
  }
  async function inspectProfilePhoto(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const detect = async () => {
      const model = await loadFaceModel();
      return model.estimateFaces(canvas, false);
    };
    let faces;
    try {
      faces = await detect();
    } catch {
      faceModel.current = null;
      faceModelLoading.current = null;
      faces = await detect();
    }
    return faces?.length === 1 && isLikelyRealFace(faces[0], canvas.width, canvas.height) && !looksLikeIllustration(canvas, faces[0]);
  }
  async function choosePhoto(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하의 JPG, PNG, WebP 사진을 골라주세요.'); return; }
    const requestId = ++photoInspect.current;
    verificationAttempt.current++; setPhotoProof(null); changeFaceConsent(false);
    setError('');
    setDraftVerified(false);
    setPhotoDraft(null);
    setPhotoCheck('checking');
    try {
      const photo = await resizePhoto(file);
      if (requestId !== photoInspect.current) return;
      setProfile(v => ({ ...v, photo }));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const ok = await visibleCheck(() => inspectProfilePhoto(photo));
      if (requestId !== photoInspect.current) return;
      if (!ok) {
        setPhotoCheck('fail');
        setPhotoDraft(null);
        setDraftVerified(false);
        setProfile(v => ({ ...v, photo: null }));
        setError('얼굴이 잘 보이는 사진을 등록해 주세요.');
        return;
      }
      setPhotoDraft(photo);
      setPhotoCheck('ok');
    } catch (e) {
      if (requestId !== photoInspect.current) return;
      setPhotoCheck('fail');
      setPhotoDraft(null);
      setDraftVerified(false);
      setProfile(v => ({ ...v, photo: null }));
      setError(e.message === '사진을 읽지 못했어요. 다시 골라 주세요.' ? e.message : '사진 확인에 실패했어요. 다시 골라 주세요.');
    }
  }
  function seatsAreLocked() {
    return pendingMove.current != null || Date.now() < moveLockUntil.current;
  }
  function freezeSeats() {
    moveLockUntil.current = Date.now() + 1600;
    setSeatFrozen(true);
    clearTimeout(freezeTimer.current);
    freezeTimer.current = window.setTimeout(() => {
      if (Date.now() >= moveLockUntil.current) setSeatFrozen(false);
    }, 1650);
  }
  async function commitMove(index) {
    if (index == null || index === seat || seatsAreLocked()) return;
    const previous = seat;
    pendingMove.current = index;
    setServer(s => s?.visit ? { ...s, visit: { ...s.visit, seat: index } } : s);
    resetConversation();
    setSheet(null);
    freezeSeats();
    try { await run('move', { seat: index }); }
    catch (e) {
      pendingMove.current = null;
      moveLockUntil.current = 0;
      setSeatFrozen(false);
      setServer(s => s?.visit ? { ...s, visit: { ...s.visit, seat: previous } } : s);
      setToast(e.message);
      return;
    }
    window.setTimeout(() => {
      if (pendingMove.current === index) pendingMove.current = null;
    }, Math.max(0, moveLockUntil.current - Date.now()));
  }
  function requestMove(index) {
    if (seatsAreLocked()) return;
    if (seconds === 0 && index !== 11) { open('menu'); return; }
    if (seat !== 11 && guests.some(g => g.seat !== 11 && Math.abs(g.seat - seat) === 1)) {
      setPendingSeat(index); open('move');
    } else commitMove(index);
  }
  async function leave() {
    resetConversation();
    voice.stop(); setSpeaker(false); setSoundOn(true); setSheet(null);
    leaving.current = true;
    setServer(s => s?.visit ? { ...s, visit: { ...s.visit, away: true } } : s);
    setScreen('lobby');
    setEntryRoom(null);
    try { await run('leave'); }
    catch (e) {
      setServer(s => s?.visit ? { ...s, visit: { ...s.visit, away: false } } : s);
      setScreen('bar');
      setToast(e.message);
    }
    finally { leaving.current = false; }
  }
  function requestMic() {
    mesh.resume();
    if (seconds === 0 && seat !== 11) { open('menu'); return; }
    const micOn = voice.mic;
    voice.toggle();
    if (micOn) setSpeaker(false);
  }
  function toggleSpeaker() {
    mesh.resume();
    if (seconds === 0 && seat !== 11) { open('menu'); return; }
    const next = !speaker;
    if (next && !voice.mic) voice.toggle();
    setSpeaker(next);
  }
  const time = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  const localRooms = rooms[region];
  const recommended = localRooms.filter(r => r.count < CAPACITY && !r.hasReportedGuest).sort((a,b) => Math.abs(a.count - 7) - Math.abs(b.count - 7))[0];
  const guestsTalking = !!guest;
  const audible = guest && gains[guest.id] > 0;
  const selected = selectedRoom?.region === region ? localRooms.find(r=>r.number===selectedRoom.number) : null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(now));
  const guestSeconds = person => tick(person.seconds, person.seat === 11);

  async function captureVerification() {
    if (!faceConsentRef.current || verificationState !== 'ready' || captureLock.current) return;
    const video=cameraVideo.current,canvas=document.createElement('canvas');
    if (!video || !canvas || !cameraStream.current?.getVideoTracks().some(track=>track.readyState==='live')) { setVerificationMessage('카메라를 다시 열어 주세요.'); return; }
    const attempt=++verificationAttempt.current;
    const current=()=>attempt===verificationAttempt.current&&faceConsentRef.current;
    const photo=photoDraft;
    if (!photo) { setVerificationMessage('프로필 사진을 다시 선택해 주세요.'); return; }
    captureLock.current=attempt;setPhotoProof(null);setDraftVerified(false);
    const controller=new AbortController();verificationController.current=controller;
    setVerificationStartedAt(Date.now());setVerificationGuide({stage:'prepare',progress:0});
    setVerificationState('checking');setVerificationMessage('얼굴 검사를 준비하고 있어요.');
    let frames=[];
    try {
      const result=await visibleCheck(async()=>{
        const [challenge,model]=await Promise.all([run('photo-challenge',undefined,{}, {signal:controller.signal}),loadFaceModel()]);
        if (!current()) return null;
        frames=await captureFacePair({video,canvas,model,motion:challenge.motion,current,
          framed:(face,w,h)=>isLikelyRealFace(face,w,h)&&faceIsWellFramed(face,w,h),
          onProgress:(message,guide)=>{if(current()){setVerificationMessage(message);setVerificationGuide(guide);}}});
        if (!current()) return null;
        setVerificationGuide({stage:'compare',progress:0});setVerificationStartedAt(Date.now());
        setVerificationMessage('촬영했어요. 사진과 얼굴을 확인하고 있어요.');
        return run('photo-verify',{photo,frames,challengeId:challenge.id,consent:true},{},{signal:controller.signal});
      });
      if (!current()) return;
      if (!result?.proof) throw new Error('얼굴을 확인하지 못했어요. 다시 촬영해 주세요.');
      setPhotoProof(result.proof);setDraftVerified(true);setVerificationGuide({stage:'done',progress:100});setVerificationState('verified');setVerificationMessage('얼굴을 확인했어요.');
    } catch (error) {
      if (current()) {setVerificationGuide({stage:'error',progress:0});setVerificationState('ready');setVerificationMessage(error.message||'얼굴 검사에 실패했어요. 다시 시도해 주세요.');}
    } finally { frames.fill(null);if(captureLock.current===attempt)captureLock.current=false;if(verificationController.current===controller)verificationController.current=null; }
  }

  function cancelVerification() {
    verificationAttempt.current++;verificationController.current?.abort();captureLock.current=false;
    setVerificationState('ready');setVerificationGuide({stage:'ready',progress:0});
    setVerificationMessage('중단했어요. 준비되면 다시 촬영해 주세요.');
  }

  if (screen === 'onboarding') return <><div className="ait-gnb-fill" aria-hidden="true"/><main className="app onboarding-screen">
    <div className="onboarding-scroll">
      <img className="onboarding-logo" src="/honsulbar-logo.png" alt="혼술바" />
      <p className="eyebrow">혼술바</p>
      <h1>혼술바의 분위기를<br/>온라인에 담았어요</h1>
      <p className="onboarding-lead">지역별 혼술바에서 내 목소리로 가볍게 대화해요.</p>
      <div className="onboarding-points">
        <div><span>01</span><p><strong>지역과 호점 고르기</strong><small>원하는 지역의 혼술바를 찾아요.</small></p></div>
        <div><span>02</span><p><strong>입장하고 자리 고르기</strong><small>바에 들어가 마음에 드는 자리에 앉아요.</small></p></div>
        <div><span>03</span><p><strong>듣고 싶은 쪽으로 돌리기</strong><small>방향을 조절해 그쪽 목소리에 집중해요.</small></p></div>
      </div>
      <div className="onboarding-notice">만 19세 이상만 이용할 수 있어요.</div>
      <Button size="xlarge" display="block" disabled={busy} onClick={completeOnboarding}>{busy ? '로그인하는 중…' : '시작하기'}</Button>    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main></>;

  if (screen === 'loading') return <><div className="ait-gnb-fill" aria-hidden="true"/><main className="app loading-screen"><div className="app-spinner" role="status" aria-label="불러오는 중"/></main></>;

  return <>
  <div className="ait-gnb-fill" aria-hidden="true"/>
  <main className="app">
    <header>
      {screen === 'bar' ? <button className="icon-button" aria-label="바 나가기" onClick={()=>open('leave')}><ArrowLeft size={21}/></button> : <button className="point-entry" aria-label={`포인트 상점, ${wallet.balance.toLocaleString()}P`} onClick={()=>open('shop')}><Coins size={17}/><span>{wallet.balance.toLocaleString()}<small> P</small></span></button>}
      <div className="header-actions"><button className="header-icon-button" aria-label="설정" onClick={()=>open('settings')}><Settings size={18}/></button><button className="notification-button" aria-label={`알림 ${notifications.length}개`} onClick={openNotifications}><Bell size={18}/>{notifications.some(item=>item.unread)&&<i/>}</button><button className="profile-button" aria-label="내 프로필" onClick={()=>openProfileEditor()}>{myPhoto ? <img src={myPhoto} alt="내 프로필"/> : <UserRound size={18}/>}</button></div>
    </header>
    {screen === 'lobby' ? <section className="lobby">
      <div className="lobby-heading"><h1>마음 가는 곳에서 잠시 머물러요</h1></div>
      <div className="regions" aria-label="지역">{REGIONS.map(r=><Button key={r} size="small" variant="weak" color={r===region?'primary':'dark'} aria-pressed={r===region} onClick={()=>{setRegion(r);setSelectedRoom(null);}}>{r}</Button>)}<Button className="region-request-button" size="small" variant="weak" color="dark" onClick={()=>{setRequestedRegion('');setCustomRegion('');setShowCustomRegion(false);open('region-request');}}>+ 지역 추가 요청</Button></div>
      <div className="list-heading"><span><i className="green-dot"/>{localRooms.reduce((sum,r)=>sum+r.count,0)}명 머무는 중</span><span className={`leftover-note${leftover?.region===region?'':' is-empty'}`} role={leftover?.region===region?'status':undefined} aria-hidden={leftover?.region!==region}><i className="blue-dot"/>{leftover?.region===region?`${leftover.number}호점 남은 이용시간 ${time}`:'1호점 남은 이용시간 00:00'}</span></div>
      {newRoom && <div className="new-room-notice" role="status">{region} {newRoom}호점이 열렸어요.</div>}
      <div className="room-list" role="group" aria-label="입장할 호점 선택">{localRooms.map(r=><div className={`room-row ${selected?.number===r.number?'selected':''} ${r.hasReportedGuest?'protected-room':''}`} key={r.number}>
        <button className="room-select" aria-pressed={selected?.number===r.number} aria-label={`${region} ${r.number}호점 선택${r.hasReportedGuest?', 이용자 보호로 입장 불가':r.count===CAPACITY?', 만석':''}`} onClick={()=>setSelectedRoom({region,number:r.number})}>
          <span className="selection-dot" aria-hidden="true">{selected?.number===r.number&&<Check size={13}/>}</span>
          <strong>{region} {r.number}호점</strong>
          <Badge size="small" variant="weak" color={r.hasReportedGuest||r.count===CAPACITY?'elephant':'blue'}>{r.hasReportedGuest?'입장 제한':r.count===CAPACITY?'만석':leftoverFor(r)||r.count>0?'입장 가능':'새로 열림'}</Badge>
          <span className="room-count"><b>{r.count}</b> / 12</span>
        </button>
        {r.hasReportedGuest ? <p className="protected-room-note">이용자 보호를 위해 현재 입장할 수 없는 바예요.</p> : selected?.number===r.number&&<div className="selected-room-detail"><span>{r.count===CAPACITY?'빈자리가 생기면 알려드려요':`빈자리 ${CAPACITY-r.count}석`}</span>{r.count===CAPACITY?<div className="room-detail-actions"><button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'미리보기 보기':'미리보기 · 500P'}</button><button onClick={()=>requestWaitlist(r)}><Bell size={14}/>{waitlist.includes(`${region}:${r.number}`)?'알림 신청됨':'빈자리 알림'}</button></div>:r.count>0&&<button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'구매한 미리보기':'미리보기 · 500P'}</button>}</div>}
      </div>)}</div>
      <p className="branch-note">{server?.safetyPaused?'안전 점검 중이에요. 잠시 후 다시 이용해 주세요.':'자리가 다 차면 다음 호점이 열려요.'}</p>
      <div className="lobby-footer">
        <p className="entry-benefit">입장 시 포인트가 차감돼요.</p>
        <div className="entry-actions"><Button color="dark" variant="weak" size="xlarge" disabled={!recommended||server?.safetyPaused} onClick={()=>requestEntry(recommended, { confirm: true })}>빠른 입장</Button><Button size="xlarge" disabled={!selected||selected.count===CAPACITY||selected.hasReportedGuest||server?.safetyPaused} onClick={()=>requestEntry(selected)}>{selected?selected.hasReportedGuest?'이용자 보호로 입장할 수 없어요':selected.count===CAPACITY?'만석이에요':leftover && leftover.region===region && leftover.number===selected.number?`${region} ${selected.number}호점 다시 입장하기`:`${region} ${selected.number}호점 입장하기`:'호점을 선택해 주세요'}</Button></div>
      </div>
    </section> : <section className="bar-screen">
      <div className="room-heading"><div><button className="room-title" aria-label={`${room.region} ${room.number}호점 나가기`} onClick={() => open('leave')}>{room.region} {room.number}호점 <DoorOpen size={18}/></button></div><span className="occupancy"><i className="green-dot"/>{guests.length+1}<span> / 12</span></span></div>
      <div className={`time-strip ${seconds < 300 && seat !== 11 ? 'time-low' : ''}`}><Clock3 size={16}/><span>{seat === 11 ? '사장 자리' : '남은 시간'}</span><strong>{seat === 11 ? '시간 제한 없음' : time}</strong><button aria-label="메뉴판 열고 시간 연장" onClick={() => {setSelection(wallet.drinkId || 'highball'); open('menu');}}><Plus size={18}/></button></div>
      <div className="bar-space"><div className={`bar-floor${seatFrozen ? ' is-frozen' : ''}`}><div className="bar-rug"/><div className="wood-bar"><i className="table-lamp lamp-one"/><i className="table-lamp lamp-two"/><i className="table-lamp lamp-three"/></div>
        {positions.map(([x,y], i) => {
          const person = guests.find(g => g.seat === i);
          const mine = seat === i;
          const occupied = mine || !!person;
          const talking = mine ? voice.mic && voice.level > .06 : speakingGuest === person?.id;
          const personDrink = mine ? wallet.drinkId : person?.drinkId;
          const leftTime=mine?seconds:person?guestSeconds(person):0;
          const paired=partners[mine?'me':person?.id];
          const rotation=(i===11?180:Math.atan2(50-y,50-x)*180/Math.PI+90)+(mine?facing:0);
          return <div key={i} className={`seat-wrap ${i === 11 ? 'host-wrap' : ''} ${talking ? 'is-speaking' : ''} ${mine ? 'my-wrap' : ''} ${paired?'paired-seat':''}`} style={{left:`${x}%`,top:`${y}%`,'--voice':mine ? voice.level : .7,'--facing':`${rotation}deg`}}>
            {mine&&<span className="facing-indicator" aria-hidden="true"/>}
            <button className={`seat ${occupied ? `occupied ${mine ? profile.gender : person.gender}` : 'empty'} ${mine ? 'mine' : ''} ${talking ? 'speaking' : ''}`} aria-label={mine ? '내 자리' : person ? `${i+1}번 손님 프로필` : i === 11 ? '빈 사장 자리로 이동' : `${i+1}번 빈자리로 이동`} disabled={!occupied && seatFrozen} onClick={() => mine ? openProfileEditor() : person ? (setSelectedGuest(person), open('guest')) : requestMove(i)}>{occupied ? <img src={mine ? myPhoto : person.photo} alt={mine ? '내 얼굴' : '손님 얼굴'}/> : <Plus size={18}/>}</button>
            {occupied && <span className="seat-drink" title={DRINKS.find(d => d.id === personDrink)?.name}><Glass id={personDrink} seconds={leftTime} host={i===11}/><span className="sr-only">{DRINKS.find(d => d.id === personDrink)?.name}, {i===11?'시간 제한 없음':`${Math.ceil(leftTime/60)}분 남음`}</span></span>}
            {paired&&<span className="pair-marker" title="서로 속삭이는 중"><MessageCircleMore size={12} style={{transform:'scaleX(-1)'}}/><span className="sr-only">서로 속삭이는 중</span></span>}{!mine&&person&&mutedGuests.includes(person.id)?<span className="muted-marker" title={reportedIds.has(person.id)?'이용자 보호로 연결되지 않아요':'음소거됨'}><VolumeX size={12}/><span className="sr-only">{reportedIds.has(person.id)?'이용자 보호로 연결되지 않아요':'음소거됨'}</span></span>:!mine&&person&&person.mic===false?<span className="muted-marker mic-off-marker" title="마이크 꺼짐"><MicOff size={12}/><span className="sr-only">마이크 꺼짐</span></span>:null}{talking && <Waves/>}{mine && <span className="me-label">나</span>}{i === 11 && <span className="host-label">{occupied ? '사장' : '사장 자리'}</span>}
          </div>;
        })}
      </div></div>
      <div className="conversation-status">{activeFocus?'1:1 대화 중 · 다른 사람에게는 들리지 않아요':voice.mic&&voice.level>.06?'지금 이야기하고 있어요':guestsTalking&&partners[guest?.id]?'두 손님이 1:1로 대화하고 있어요':guestsTalking?(audible?'가까운 자리에서 이야기하고 있어요':'저쪽 자리에서 이야기하고 있어요'):'빈자리를 누르면 옮길 수 있어요'}</div>
      <div className="direction-control">
        {activeFocus?<div className="focus-active"><MessageCircleMore size={17}/><span>1:1 대화 중 · 다른 사람에게는 들리지 않아요</span><button onClick={endFocus}>전체 대화로</button></div>:focusRequest?<div className="focus-active"><span>대화 요청에 답을 기다려요</span><button onClick={cancelFocus}>취소</button></div>:incomingFocus?<div className="focus-active"><MessageCircleMore size={17}/><span>옆자리 손님이 둘만의 대화를 요청했어요</span><button onClick={()=>respondFocus(false)}>거절</button><button onClick={()=>respondFocus(true)}>수락</button></div>:<>
          <div className="direction-label"><span>소리 집중 방향</span><output>{facing===0?'양쪽 고르게':`${facing<0?'왼쪽':'오른쪽'}으로 ${Math.abs(facing)}°`}</output></div>
          <div className="direction-presets"><button className={facing < -15 ? 'active' : ''} onClick={()=>setFacing(-60)}>왼쪽</button><button className={Math.abs(facing) <= 15 ? 'active' : ''} onClick={()=>setFacing(0)}>양쪽</button><button className={facing > 15 ? 'active' : ''} onClick={()=>setFacing(60)}>오른쪽</button></div><div className="direction-slider"><span aria-hidden="true">왼쪽</span><input type="range" aria-label="대화 방향 각도" min="-90" max="90" step="15" value={facing} style={{'--range-progress':`${((facing + 90) / 180) * 100}%`}} onChange={e=>setFacing(Number(e.target.value))}/><span aria-hidden="true">오른쪽</span></div>
          {neighbors.length>0&&<div className="neighbor-actions">{neighbors.map(g=><button key={g.id} onClick={()=>{setSelectedGuest(g);open('guest');}}><ArrowLeftRight size={13}/>{g.seat<seat?'왼쪽':'오른쪽'} 옆자리{partners[g.id]?' · 대화 중':'와만 대화'}</button>)}</div>}
        </>}
      </div>
      {incoming && <button className="seat-offer incoming-offer" onClick={() => open('incoming')}><ArrowLeftRight size={18}/><span>자리 양보를 부탁받았어요<small>{incomingSeconds}초 안에 수락할 수 있어요</small></span><b>+500 P</b></button>}
      {outgoing && <div className="seat-offer"><Clock3 size={18}/><span>자리 양보 답변을 기다려요<small>수락 전에는 포인트가 차감되지 않아요</small></span><button onClick={cancelOutgoing}>취소</button></div>}
      <div className="current-drink"><Glass id={wallet.drinkId} seconds={seconds} host={seat===11}/><span className="current-drink-name"><b>{currentDrink?.name}</b><small>{seat===11?'시간 제한 없음':`${Math.ceil(seconds/60)}분 남음`}</small></span><button aria-label="포인트 상점" onClick={() => open('shop')}><Wallet size={13}/>{wallet.balance.toLocaleString()} P</button></div>
      {seconds === 0 && seat !== 11 && <p role="status" className="error">이용시간이 끝났어요. 한 잔 더 주문하고 머물러요.</p>}
      <div className="controls"><button className={voice.mic ? 'mic-active' : ''} aria-pressed={voice.mic} onClick={requestMic}>{voice.mic ? <Mic size={21}/> : <MicOff size={21}/>}<span>{voice.pending ? '연결 중' : voice.mic ? '마이크 켜짐' : '마이크 꺼짐'}</span></button><button className={speaker ? 'speaker-active' : ''} aria-pressed={speaker} onClick={toggleSpeaker}><Speaker size={21}/><span>{speaker ? '스피커 켜짐' : '스피커 꺼짐'}</span></button><button className={soundOn ? 'sound-active' : ''} aria-pressed={soundOn} onClick={() => {mesh.resume();setSoundOn(v=>!v);}}>{soundOn ? <Volume2 size={21}/> : <VolumeX size={21}/>}<span>{soundOn ? '소리 켜짐' : '소리 꺼짐'}</span></button><button className="order-control" onClick={() => {setSelection(wallet.drinkId || 'highball'); open('menu');}}><Wine size={21}/><span>한 잔 더</span></button></div>
    </section>}
  </main>
      {screen === 'bar' && config?.voiceEvidenceReady && voiceAgreed && <p className="voice-safety-notice">신고 보호 · 최근 20초 기기 임시 보관 · 신고 시 선택 제출</p>}
      <BottomSheet open={!!sheet} onClose={closeSheet} ariaLabelledBy="sheet-title" className="app-bottom-sheet">
      <div className={`sheet sheet-compact ${sheet === 'guest' ? 'sheet-guest' : ''} ${sheet === 'profile' ? 'sheet-profile' : ''} ${sheet === 'verify-profile' ? 'sheet-camera' : ''} ${sheet === 'region-request' ? 'sheet-region-request' : ''}`}><button className="close icon-button" aria-label="닫기" onClick={closeSheet}><X size={22}/></button>
      {(sheet === 'welcome' || sheet === 'menu') && <><p className="eyebrow">{isWelcome ? `${room?.region} ${room?.number}호점 입장` : '메뉴판'}</p><h2 id="sheet-title">{isWelcome ? '어떤 음료로 시작할까요?' : '한 잔 더 하고 갈까요?'}</h2><p className="sheet-description">{isWelcome ? (subscription ? '구독 중이면 입장에 포인트가 차감되지 않아요.' : '입장 시 포인트가 차감돼요.') : '주문한 잔은 내 사진 옆에 놓여요.'}</p><div className="menu">{DRINKS.filter(item => !isWelcome || item.minutes === 30).map(item => <button className={selection === item.id ? 'chosen' : ''} key={item.id} aria-pressed={selection === item.id} onClick={() => {setSelection(item.id);setError('');}}><div className="drink-illustration"><Glass id={item.id}/></div><span><strong>{item.name}</strong><small>{item.note}</small><em>{`+${item.minutes}분`}</em></span><span className="menu-price">{isWelcome ? `입장 ${item.price.toLocaleString()}P` : `${item.price.toLocaleString()} P`}{selection === item.id && <Check size={16}/>}</span></button>)}</div><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>{subscription ? '구독 이용' : (isWelcome ? '입장 후 남는 포인트' : '주문 후 남는 포인트')}<strong>{subscription ? '0 P' : `${Math.max(0,wallet.balance-price).toLocaleString()} P`}</strong></span></div><p className="digital-note">음료는 취향을 표현하는 아이템이에요.</p>{!subscription && wallet.balance<price?<><div className="insufficient-state"><strong>{(price-wallet.balance).toLocaleString()}P가 더 필요해요</strong><span>충전 후 {isWelcome ? '입장' : '주문'}할 수 있어요.</span></div><Button className="sheet-recharge-cta" size="xlarge" display="block" onClick={()=>open('shop')}>포인트 충전하기</Button><p className="footnote">충전 후 선택한 음료로 이용해요.</p></>:<div className="sheet-inline-cta"><Button size="xlarge" display="block" onClick={confirmOrder}>{subscription ? (isWelcome ? `${chosen.minutes}분 입장하기` : `주문 · ${chosen.minutes}분 연장`) : (isWelcome ? `${price.toLocaleString()} 포인트로 ${chosen.minutes}분 입장하기` : `${price.toLocaleString()} 포인트로 주문 · ${chosen.minutes}분 연장`)}</Button><p className="footnote">{subscription ? '구독 기간에는 입장·연장에 포인트가 차감되지 않아요.' : (isWelcome ? (leftover ? '다른 호점에 입장하면 남은 이용시간은 끝나요.' : '바를 나가도 이 호점 이용시간은 이어져요.') : '주문을 누르면 포인트가 차감되고 이용시간이 늘어나요.')}</p></div>}</>}
      {sheet === 'preview' && previewRoom && <><p className="eyebrow">{previewRoom.region} {previewRoom.number}호점</p><h2 id="sheet-title">{purchasedPreview ? '지금 이 바의 손님들' : '들어가기 전에 살짝 볼까요?'}</h2>{purchasedPreview ? <><p className="sheet-description">구매한 시점의 손님들이에요. 입장할 때는 달라질 수 있어요.</p><div className="preview-portraits">{purchasedPreview.guests.map(g => <div key={g.id} className={g.gender}><img src={g.photo} alt="미리보기 손님"/></div>)}</div>{rooms[previewRoom.region].find(r => r.number === previewRoom.number)?.count === CAPACITY ? <Button size="xlarge" display="block" onClick={() => requestWaitlist(previewRoom)}><Bell size={17}/>빈자리 알림 신청</Button> : <Button size="xlarge" display="block" onClick={() => requestEntry(previewRoom)}>이 바에 입장하기</Button>}</> : <><div className="locked-preview"><LockKeyhole size={29}/><span>사진은 미리보기 구매 후 공개돼요.</span></div><p className="sheet-description">{subscription ? '구독 중이면 미리보기에 포인트가 차감되지 않아요.' : '500P로 현재 손님들의 프로필 사진을 확인해요.'}<br/>입장·자리 예약은 포함되지 않아요.</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>{subscription ? '구독 이용' : '구매 후 남는 포인트'}<strong>{subscription ? '0 P' : `${Math.max(0,wallet.balance-500).toLocaleString()} P`}</strong></span></div><Button size="xlarge" display="block" disabled={!subscription && wallet.balance < 500} onClick={buyPreview}>{subscription ? '구독으로 미리보기' : '500P로 미리보기'}</Button></>}</>}
      {sheet === 'incoming' && incoming && <><p className="eyebrow">자리 양보 요청</p><h2 id="sheet-title">자리 바꿔주실래요?</h2><p className="sheet-description">다른 손님이 지금 내 자리를 부탁했어요.<br/>{incomingSeconds}초 안에 수락하면 500P를 받아요.<br/>오늘 남은 보상 {Math.max(0,DAILY_SWAP_REWARD_LIMIT-dailySwapRewards)}회</p><div className="swap-reward"><ArrowLeftRight size={24}/><strong>+500 P</strong><span>수락과 동시에 적립</span></div><div className="actions"><Button color="dark" variant="weak" onClick={() => respondSwap(false)}>거절하기</Button><Button size="xlarge" disabled={dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT} onClick={() => respondSwap(true)}>{dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT ? '오늘 보상 한도에 도달했어요' : '양보하고 500P 받기'}</Button></div></>}
      {sheet === 'seat-request' && selectedGuest && <><p className="eyebrow">자리 양보 부탁</p><h2 id="sheet-title">자리 양보를 부탁할까요?</h2><p className="sheet-description">상대가 수락하면 500P를 보내고 서로 자리를 바꿔요.<br/>거절하거나 취소하면 포인트는 사용되지 않아요.<br/>같은 자리에는 한 번만 부탁할 수 있어요.<br/>오늘 남은 요청 {Math.max(0,DAILY_SWAP_REQUEST_LIMIT-dailySwapRequests)}회</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>수락 후 남는 포인트<strong>{Math.max(0,wallet.balance-500).toLocaleString()} P</strong></span></div><Button size="xlarge" display="block" disabled={wallet.balance < 500 || !!outgoing || dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT || (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 1} onClick={sendSeatRequest}>{dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT ? '오늘 요청 한도에 도달했어요' : (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 1 ? '이미 요청했어요' : '500 포인트로 자리 양보 부탁하기'}</Button></>}
      {sheet==='shop'&&<><h2 id="sheet-title">내 포인트</h2><div className="point-balance"><Coins size={24}/><strong>{wallet.balance.toLocaleString()}<small> P</small></strong></div>
        <h3 className="section-title">포인트 모으기</h3>
        <div className="shop-list">
          <div className="shop-row"><span><strong>매일 출석</strong><small>광고 보고 하루 한 번 1,000P</small></span><Button size="small" variant="weak" disabled={wallet.attendanceDate===today || adInProgress} onClick={attendance}>{wallet.attendanceDate===today?'완료':adInProgress?'시청 중…':'광고 보기'}</Button></div>
          <div className="shop-row"><span><strong>자리 양보</strong><small>요청을 수락하고 자리를 바꾸면</small></span><b>+500P</b></div>
        </div>
        <h3 className="section-title">포인트 충전</h3><p className="shop-note">많이 충전할수록 보너스를 받아요.</p><div className="point-packs">{POINT_PACKS.map(pack=><button key={pack.points} onClick={()=>{setShopPack(pack);open('charge');}}><span>{pack.points.toLocaleString()} P {pack.bonus>0&&<em>{pack.label}</em>}</span><strong>{pack.won.toLocaleString()}원 <ArrowRight size={15}/></strong></button>)}</div>
        <h3 ref={subscriptionSection} className="section-title">정기 구독</h3><div className={`subscription-card ${subscriptionCancelAt?'is-canceling':''}`}><div><strong>{subscription?subscriptionCancelAt?'해지됨':'이용 중':`${SUBSCRIPTIONS[0].price.toLocaleString()}원`}</strong><small>{subscriptionCancelAt?`${subscriptionEndLabel()}까지 이용할 수 있어요.`:'입장·연장·미리보기 제한 없이 사용'}</small></div><Button size="small" variant="weak" onClick={requestSubscriptionChange}>{subscription?'해지 방법':'시작하기'}</Button></div><p className="shop-note">매월 자동 결제돼요. 해지는 토스 결제 내역에서 할 수 있어요.</p><h3 className="section-title">이렇게 사용해요</h3><div className="shop-list point-uses"><span>입장<strong>500P</strong></span><span>시간 연장<strong>30분 500P</strong></span><span>손님 미리보기<strong>500P</strong></span><span>자리 양보 부탁<strong>수락 시 500P</strong></span></div>
        <h3 className="section-title">최근 내역 <small className="history-limit">{historyLimit===10?'최근 10건':`${Math.min(historyLimit,ledgerCount)}건`}</small></h3><div className="point-history">{ledger.slice(0,historyLimit).map((item,index)=><div key={item.id}><span className="history-item-label"><strong>{item.label}</strong><small>{formatHistoryDate(item.date || Date.now() - index * 86400000)}</small></span><b className={item.amount>0?'earned':''}>{item.amount>0?'+':''}{item.amount.toLocaleString()} P</b></div>)}</div>{ledgerCount>10&&<div className="history-actions">{historyLimit===10?<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(Math.min(30,ledgerCount))}>전체 내역 보기</Button>:<>{historyLimit>=ledgerCount&&<p className="history-complete">모든 내역을 보고 있어요.</p>}<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(10)}>최근 10건만 보기</Button>{historyLimit<ledgerCount&&historyLimit<100&&<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(v=>Math.min(v+20,ledgerCount,100))}>더 불러오기</Button>}</>}</div>}</>}
      {sheet==='charge'&&<><h2 id="sheet-title">포인트 충전</h2><div className="point-balance"><Coins size={24}/><strong>{shopPack.points.toLocaleString()} P</strong></div><div className="order-summary"><span>상품 금액<strong>{shopPack.won.toLocaleString()}원</strong></span><span>충전 후 포인트<b>{(wallet.balance+shopPack.points).toLocaleString()} P</b></span></div><p className="sheet-description">결제 후 {shopPack.points.toLocaleString()}P가 충전돼요. 토스에서 결제해요.</p><Button display="block" disabled={busy} onClick={buyPoints}>{busy ? '결제 진행 중…' : '결제하고 충전하기'}</Button><Button display="block" variant="weak" color="dark" onClick={()=>open('shop')}>다른 상품 보기</Button></>}
      {sheet==='subscription-confirm'&&<><p className="eyebrow">정기 구독</p><h2 id="sheet-title">정기 구독을 시작할까요?</h2><p className="sheet-description">{`매월 ${SUBSCRIPTIONS[0].price.toLocaleString()}원이 자동 결제되고, 입장·연장·미리보기를 제한 없이 이용할 수 있어요.`}</p><div className="actions"><Button color="dark" variant="weak" onClick={()=>setSheet('shop')}>취소</Button><Button size="xlarge" onClick={confirmSubscriptionChange}>구독 시작하기</Button></div></>}
      {sheet==='subscription-cancel-guide'&&<><p className="eyebrow">정기 구독</p><h2 id="sheet-title">해지는 토스에서 할 수 있어요</h2><p className="sheet-description">토스 결제 내역에서 구독을 해지해 주세요. 해지 후에도 남은 기간은 이용할 수 있어요. 같은 화면에서 자동 결제를 다시 켤 수 있어요.</p><Button size="xlarge" display="block" onClick={()=>setSheet('shop')}>확인</Button></>}
      {sheet==='notifications'&&<><h2 id="sheet-title">알림</h2>{notifications.length===0?<p className="sheet-description">새로운 알림이 없어요.</p>:<div className="notification-list">{notifications.map(item=><button key={item.id} onClick={()=>openNotification(item)}><Bell size={17}/><span><strong>{item.title}</strong><small>{item.body}</small></span><ArrowRight size={16}/></button>)}</div>}</>}
      {sheet === 'profile' && <><div className="sheet-heading-row"><div><p className="eyebrow">내 프로필</p><h2 id="sheet-title">프로필을 설정해 주세요</h2></div></div><p className="sheet-description">사진과 닉네임은 다른 손님에게 보여요.</p><input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto}/><button className="upload" onClick={() => upload.current.click()}>{profile.photo ? <img src={profile.photo} alt="선택한 내 사진"/> : <Camera size={30}/>}<span>{profile.photo ? '사진 바꾸기' : '사진 등록하기'}</span></button><p className={`photo-note${photoCheck==='ok' || (profileVerified && photoCheck!=='checking') ? ' is-ok' : ''}`}>{photoCheck==='checking' ? '얼굴 사진을 검사하고 있어요.' : photoCheck==='ok' ? '이 사진으로 진행할 수 있어요.' : profileVerified ? '확인된 사진이에요. 변경 시 다시 검사해요.' : '본인 얼굴 사진을 사용해 주세요.'}</p><label className="profile-field"><span>닉네임</span><input value={profile.nickname} maxLength={16} aria-invalid={!!nicknameError} onChange={e=>setProfile(v=>({...v,nickname:e.target.value}))} placeholder="닉네임을 입력해 주세요"/>{nicknameError&&<small className="field-error">{nicknameError}</small>}</label><div className="gender-choice">{[['male','남성'],['female','여성']].map(([value,label]) => <button key={value} aria-pressed={profile.gender === value} className={profile.gender === value ? `selected ${value}` : ''} onClick={() => setProfile(v => ({...v,gender:value}))}>{label}{profile.gender === value && <Check size={17}/>}</button>)}</div><p className="profile-save-note">{profileVerified ? '변경한 내용을 저장해 주세요.' : '사진을 저장하려면 얼굴 확인이 필요해요.'}</p><Button size="xlarge" display="block" disabled={!profile.photo || !profile.gender || !!nicknameError || photoCheck==='checking' || (!profileVerified && photoCheck!=='ok')} onClick={() => profileVerified ? saveProfile() : open('verify-profile')}>{profileVerified ? '프로필 저장하기' : '얼굴 확인하기'}</Button></>}
      {sheet === 'verify-profile' && <><p className="eyebrow">본인 얼굴 확인</p><h2 id="sheet-title">실제 얼굴을 촬영해 주세요</h2><FaceConsent checked={faceConsent} onChange={changeFaceConsent}/><div className={`camera-preview verification-camera is-${verificationGuide.stage}`}><video ref={cameraVideo} className="camera-video-hidden" muted playsInline disablePictureInPicture controls={false} webkit-playsinline="true" x-webkit-airplay="deny" tabIndex={-1} aria-hidden="true"/><canvas ref={cameraView} className="camera-view" aria-label="본인 얼굴 촬영 화면"/><i className={`camera-guide motion-${verificationGuide.motion || 'none'}`} aria-hidden="true"/><canvas ref={cameraCanvas} hidden/><CameraVerificationStatus guide={verificationGuide} message={verificationMessage} state={verificationState} elapsed={Math.max(0,Math.floor((now-verificationStartedAt)/1000))}/></div><div className="camera-actions">{verificationState==='verified'?<Button size="xlarge" display="block" disabled={!faceConsent||!photoProof||busy} onClick={saveProfile}>프로필 저장하기</Button>:verificationState==='unavailable'?<Button size="xlarge" display="block" onClick={() => { setSheetState(null); setTimeout(() => setSheetState('verify-profile'), 0); }}>권한 다시 요청하기</Button>:<Button size="xlarge" display="block" disabled={verificationState!=='ready'||!faceConsent} onClick={captureVerification}>{verificationState==='checking'?'얼굴 확인 중…':verificationState==='starting'?'카메라 준비 중…':verificationGuide.stage==='error'?'다시 촬영하기':'촬영 시작'}</Button>}{verificationState==='checking'&&<button type="button" className="camera-cancel" onClick={cancelVerification}>검사 중단</button>}</div></>}
      {sheet === 'settings' && <><p className="eyebrow">설정</p><h2 id="sheet-title">도움이 필요하신가요?</h2><p className="sheet-description">서비스 이용과 계정을 관리할 수 있어요.</p><div className="settings-group"><span>도움말</span><div className="settings-list"><button onClick={()=>open('support')}>고객센터<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>신고·문의<ArrowRight size={16}/></button><button onClick={()=>open('legal')}>약관 및 정책<ArrowRight size={16}/></button>{config?.voiceEvidenceReady&&<button disabled={busy} onClick={revokeVoiceConsent}>음성 안전 처리 동의 철회<ArrowRight size={16}/></button>}</div></div><div className="settings-group"><span>알림</span><div className="settings-list"><div className="settings-toggle"><span><strong>빈자리 알림</strong><small>만석 호점에 자리가 나면 알려드려요</small></span><button type="button" role="switch" aria-checked={waitlistAlerts||waitlist.length>0} className={`alert-switch${waitlistAlerts||waitlist.length>0?' is-on':''}`} onClick={()=>setWaitlistAlertEnabled(!(waitlistAlerts||waitlist.length>0))}><i/></button></div></div></div><div className="settings-group"><span>계정 및 결제</span><div className="settings-list"><button onClick={openSubscriptionManager}>결제·정기 구독 관리<ArrowRight size={16}/></button><button onClick={()=>open('withdraw')} className="danger-link">회원탈퇴<ArrowRight size={16}/></button></div></div></>}
      {sheet === 'region-request' && <><p className="eyebrow">지역 추가 요청</p><h2 id="sheet-title">어디에서 만나고 싶나요?</h2><p className="sheet-description">원하는 지역을 골라 주세요.</p>{REGION_REQUEST_GROUPS.map(group=><div className="region-request-section" key={group.title}><span>{group.title}</span><div className="region-request-grid">{group.options.map(item=><button key={item} className={requestedRegion===item?'selected':''} onClick={()=>{setRequestedRegion(item);setShowCustomRegion(false);}}>{item}</button>)}{group.title==='주요 도시'&&<button style={{borderStyle:'dashed',borderWidth:'1.5px',borderColor:'#b7c0cb'}} className={`custom-region-toggle ${showCustomRegion?'selected':''}`} onClick={()=>{setShowCustomRegion(v=>!v);setRequestedRegion('');}}>직접 입력</button>}</div></div>)}{showCustomRegion&&<input className="custom-region-input" value={customRegion} onChange={e=>setCustomRegion(e.target.value)} placeholder="지역명을 입력해 주세요" maxLength={20}/>}<Button display="block" disabled={!requestedRegion && !(showCustomRegion&&customRegion.trim())} onClick={submitRegion}>이 지역 추가 요청하기</Button><p className="digital-note">요청 건수와 우선순위에 따라 지역을 추가해요.</p></>}
      {sheet === 'legal' && <><p className="eyebrow">약관 및 정책</p><h2 id="sheet-title">혼술바 정책</h2><p className="sheet-description">서비스 이용에 필요한 약관과 정책을 확인할 수 있어요.</p><div className="settings-list">{LEGAL_DOCS.map(([label,href])=><button key={href} onClick={()=>{setLegalSrc(href);open('legal-doc');}}>{label}<ArrowRight size={16}/></button>)}</div></>}
      {sheet === 'legal-doc' && <><p className="eyebrow">약관 및 정책</p><h2 id="sheet-title">{LEGAL_DOCS.find(([_,href])=>href===legalSrc)?.[0]||'정책'}</h2><iframe className="legal-frame" src={legalSrc} title="약관 문서"/><Button display="block" variant="weak" color="dark" onClick={()=>open('legal')}>목록으로</Button></>}
      {sheet === 'support' && <><p className="eyebrow">고객센터</p><h2 id="sheet-title">무엇을 도와드릴까요?</h2><p className="sheet-description">혼술바 이용 중 궁금한 점을 확인하거나 문의를 남겨 주세요.</p><div className="settings-list"><button onClick={()=>{setOpenFaq(null);open('faq')}}>자주 묻는 질문<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>문의 남기기<ArrowRight size={16}/></button></div></>}
      {sheet === 'faq' && <><p className="eyebrow">자주 묻는 질문</p><h2 id="sheet-title">혼술바 이용 안내</h2><p className="sheet-description">자주 궁금해하는 내용을 모아봤어요.</p><div className="faq-list">{FAQ_ITEMS.map(([question,answer],index)=><div className={`faq-item ${openFaq===index?'open':''}`} key={question}><button onClick={()=>setOpenFaq(openFaq===index?null:index)}><span>{question}</span>{openFaq===index?<ChevronDown size={17}/>:<ArrowRight size={17}/>}</button>{openFaq===index&&<p>{answer}</p>}</div>)}</div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>답을 찾지 못했어요 · 문의하기</Button></>}
      {sheet === 'inquiry' && <><p className="eyebrow">신고·문의</p><h2 id="sheet-title">문의 내용을 남겨 주세요</h2><p className="sheet-description">확인 후 운영팀이 순서대로 답변드릴게요.</p><div className="form-choice">{['결제·구독 문의','이용 방법 문의','서비스 신고','기타 문의'].map(item=><button key={item} className={inquiryType===item?'selected':''} onClick={()=>setInquiryType(item)}>{item}</button>)}</div><textarea className="support-textarea" value={inquiryMessage} onChange={e=>setInquiryMessage(e.target.value)} placeholder={inquiryType==='서비스 신고'?'신고할 내용을 자세히 입력해 주세요.':'문의 내용을 입력해 주세요.'} maxLength={500}/><div className="form-footer"><span>{inquiryMessage.length}/500</span><Button size="large" disabled={!inquiryMessage.trim()} onClick={submitInquiry}>{inquiryType==='서비스 신고'?'신고 접수하기':'문의 접수하기'}</Button></div></>}
      {sheet === 'inquiry-detail' && selectedInquiry && <><p className="eyebrow">문의 답변</p><h2 id="sheet-title">운영팀 답변</h2><div className="inquiry-message"><small>{selectedInquiry.type}</small><p>{selectedInquiry.message}</p></div><div className="inquiry-answer"><strong>운영팀</strong><p>{selectedInquiry.answer || '확인 중이에요. 답변은 알림으로 알려드려요.'}</p></div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>문의 남기기</Button></>}
      {sheet === 'withdraw' && <><p className="eyebrow">회원탈퇴</p><h2 id="sheet-title">정말 탈퇴할까요?</h2><p className="sheet-description">탈퇴하면 프로필·이용 기록을 복구할 수 없어요. 구독 중이면 먼저 해지해 주세요.</p>{subscription&&!subscriptionCancelAt&&<p className="error">지금은 구독 중이라, 해지한 뒤에 탈퇴할 수 있어요.</p>}<div className="actions">{subscription&&!subscriptionCancelAt?
        <Button size="xlarge" display="block" onClick={()=>{setOpenFaq(4);open('faq');}}>해지 방법 보기</Button>
      :<>
        <Button color="dark" variant="weak" onClick={closeSheet}>취소</Button>
        <Button size="xlarge" disabled={busy} onClick={withdraw}>탈퇴하기</Button>
      </>}</div></>}
      {sheet === 'move' && <><h2 id="sheet-title">옆자리 분께 인사하고 갈까요?</h2><p className="sheet-description">가볍게 인사를 건네고 자리를 옮겨요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>머무르기</Button><Button size="xlarge" onClick={() => commitMove(pendingSeat)}>자리 옮기기</Button></div></>}
      {sheet === 'guest' && selectedGuest && <><div className="guest-photo"><img src={selectedGuest.photo} alt="선택한 손님"/><Glass id={selectedGuest.drinkId}/></div><h2 id="sheet-title">{selectedGuest.nickname || '혼술 친구'}</h2><p className="guest-meta"><span>{DRINKS.find(d => d.id === selectedGuest.drinkId)?.name} 마시는 중</span><span aria-hidden="true">·</span><span>{partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?'옆자리와 대화 중':mutedGuests.includes(selectedGuest.id)?(reportedIds.has(selectedGuest.id)?'이용자 보호로 연결되지 않아요':'음소거되어 들리지 않아요'):selectedGuest.mic===false?'마이크가 꺼져 있어요':`내 자리에서 ${Math.round(audioGain({id:'me',seat},selectedGuest,facing,partners,mutedGuests)*100)}%로 들려요`}</span></p>
        {partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?<div className="guest-focus-panel"><MessageCircleMore size={18}/><p>지금 1:1로 대화하고 있어요.<br/>다른 사람에게는 목소리가 들리지 않아요.</p><Button size="large" variant="weak" disabled={waveSent.includes(selectedGuest.id)} onClick={()=>sendWave(selectedGuest)}>{waveSent.includes(selectedGuest.id)?'인사를 남겼어요':'손 흔들기'}</Button></div>:activeFocus===selectedGuest.id?<Button display="block" variant="weak" onClick={()=>{endFocus();setSheet(null);}}>전체 대화로 돌아가기</Button>:<div className="guest-focus-panel"><Button size="large" display="block" disabled={!adjacent(seat,selectedGuest.seat)||!!activeFocus||!!focusRequest||mutedGuests.includes(selectedGuest.id)||seconds===0} onClick={()=>requestFocus(selectedGuest)}>이 옆자리와만 대화하기</Button><p>{!adjacent(seat,selectedGuest.seat)?'바로 옆에 앉아 있을 때 이용할 수 있어요.':'수락하면 둘만 들리고, 자리를 옮기면 전체 대화로 돌아가요.'}</p></div>}
        <Button className="guest-seat-request" size="large" variant="weak" color="dark" display="block" disabled={!!outgoing || wallet.balance < 500} onClick={() => open('seat-request')}><ArrowLeftRight size={17}/>이 자리 부탁하기 · 500P</Button><p className="footnote">상대가 수락하면 서로 자리를 바꿔요.</p><div className="guest-actions"><button onClick={() => {if(reportedIds.has(selectedGuest.id)) return; if(activeFocus===selectedGuest.id) endFocus();setMutedGuests(v => v.includes(selectedGuest.id) ? v.filter(id => id !== selectedGuest.id) : [...v,selectedGuest.id]);setSheet(null);}}><VolumeX size={15}/>{reportedIds.has(selectedGuest.id) ? '이용자 보호로 연결 제한됨' : mutedGuests.includes(selectedGuest.id) ? '음소거 해제' : selectedGuest.seat===11 ? '사장 음소거' : '음소거'}</button><button disabled={reportedIds.has(selectedGuest.id)} onClick={async()=>{try{await run('block',{targetId:selectedGuest.id});setSheet(null);setToast('서로 연결되지 않도록 차단했어요.');}catch(error){fail(error);}}}>차단</button><button onClick={() => open('report')}><Flag size={15}/>신고</button></div></>}
      {sheet === 'voice-consent' && <><h2 id="sheet-title">안전한 음성 대화를 위한 안내</h2><p className="sheet-description">대화 중 들리는 상대 음성을 최근 최대 20초까지 기기 메모리에 임시 보관해요. 오래된 음성은 덮어쓰고 퇴장하면 지워요. 신고할 때 상대 음성을 선택해 제출할 수 있어요.</p><p className="sheet-description">제출된 음성은 암호화해 최대 7일 보관하고 권한 있는 운영자만 신고 조사에 사용해요. 광고·AI 학습에는 사용하지 않아요. 상대도 신고 시 내 음성을 제출할 수 있어요. 동의하지 않아도 로비·고객센터는 이용할 수 있어요.</p><label className="sheet-description"><input type="checkbox" checked={voiceConsentChecked} onChange={e=>setVoiceConsentChecked(e.target.checked)}/> 음성의 임시 보관과 신고 시 제출·운영자 검토에 동의해요. (음성 입장 필수)</label><Button display="block" disabled={!voiceConsentChecked||busy} onClick={agreeVoice}>동의하고 계속하기</Button><Button display="block" variant="weak" disabled={busy} onClick={()=>{setPendingEntry(null);setSheet(null);if(screen==='bar')run('leave').catch(fail);}}>나중에 할게요</Button></>}
      {sheet === 'report' && <><p className="eyebrow">신고하기</p><h2 id="sheet-title">어떤 일이 있었나요?</h2><p className="sheet-description">상황 설명과 이용 기록을 확인해요. 신고만으로 위반이 확정되지는 않아요.</p>{reportAudio ? <label className="sheet-description"><input type="checkbox" checked={attachVoice} onChange={e=>setAttachVoice(e.target.checked)}/> 상대 음성 최근 {Math.ceil(reportAudio.seconds)}초를 증거로 제출해요. 운영자 검토용으로 최대 7일 보관해요.</label> : <p className="sheet-description">첨부할 음성이 없어요. 음성 없이도 신고할 수 있어요.</p>}<div className="form-choice report-choice">{['미성년자 이용 의심','조건만남·성매매·성적 착취','성희롱·협박·스토킹','사진 도용·허위 프로필','욕설·불쾌한 발언','광고·금전 요구','기타'].map(reason=><button key={reason} className={reportReason===reason?'selected':''} onClick={()=>setReportReason(reason)}>{reason}</button>)}</div><textarea className="support-textarea" value={reportMessage} onChange={e=>setReportMessage(e.target.value)} placeholder="기억나는 말·상황을 적어 주세요. (선택)" maxLength={500}/><div className="form-footer"><span>{reportMessage.length}/500</span><Button size="large" disabled={!reportReason || busy} onClick={submitReport}>신고 접수하기</Button></div></>}
      {sheet === 'rejoin' && entryRoom && <><p className="eyebrow">{entryRoom.region} {entryRoom.number}호점</p><h2 id="sheet-title">남은 시간으로 다시 입장할까요?</h2><p className="sheet-description">이전에 쓰던 이용시간으로 들어가요.<br/>음료를 다시 고르지 않아도 돼요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>나중에</Button><Button size="xlarge" onClick={() => rejoinRoom(entryRoom)}>다시 입장하기</Button></div></>}
      {sheet === 'leave' && <><DoorOpen size={28}/><h2 id="sheet-title">오늘은 여기까지 할까요?</h2><p className="sheet-description">바를 나가도 이용시간은 계속 흘러요.<br/>자리가 있으면 같은 호점에 다시 들어갈 수 있어요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>더 머무르기</Button><Button size="xlarge" onClick={leave}>바 나가기</Button></div></>}
      {error && <p className="error" role="alert">{error}</p>}
    </div></BottomSheet>
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;
}
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('admin') ? <AdminPage/> : <App/>);
