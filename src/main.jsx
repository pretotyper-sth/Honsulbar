import React, { useEffect, useMemo, useRef, useState } from 'react';
import '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { createRoot } from 'react-dom/client';
import { IAP, loadFullScreenAd, showFullScreenAd, getPermission, openPermissionDialog } from '@apps-in-toss/web-framework';
import { Button, BottomSheet, Badge } from './ui';
import { ArrowLeft, ArrowRight, Bell, Camera, Check, ChevronDown, Clock3, DoorOpen, Coins, MessageCircleMore, Mic, MicOff, Plus, Volume2, VolumeX, Speaker, Wine, X, Flag, Wallet, Eye, LockKeyhole, ArrowLeftRight, Settings, UserRound } from 'lucide-react';
import { REGIONS, CAPACITY, DRINKS } from './model';
import { useVoice } from './useVoice';
import { useMesh } from './useMesh';
import { call, getConfig, login, clearSession, hasSession, assetUrl, insideToss, requestPushAgreement } from './api';
import { Glass } from './Glass';
import { SEATS as positions, POINT_PACKS, SUBSCRIPTIONS, adjacent, audioGain } from './social';
import { AdminPage } from './admin';
import './style.css';

function Waves() { return <span className="waves" aria-hidden="true"><i/><i/><i/><i/></span>; }
const FAQ_ITEMS = [
  ['입장하면 포인트가 얼마 차감되나요?', '첫 입장은 선택한 음료에 따라 차감돼요. 기본 음료는 500P로 30분 이용할 수 있고, 입장 후 한 잔 더 주문해 시간을 연장할 수 있어요.'],
  ['바를 나가면 남은 시간이 어떻게 되나요?', '한 호점에서만 이용 시간이 흐르고, 바를 나가면 이번 방문이 끝나요. 남은 시간은 다른 호점으로 이어지지 않아요.'],
  ['입장 전에 손님 사진을 볼 수 있나요?', '미리보기 상품을 구매하면 현재 호점에 있는 손님들의 사진을 확인할 수 있어요. 미리보기는 입장이나 자리 예약을 포함하지 않아요.'],
  ['목소리가 불편한 손님은 어떻게 신고하나요?', '손님 프로필에서 신고를 선택하고 사유와 내용을 접수해 주세요. 신고한 손님의 목소리는 바로 들리지 않고, 그 손님이 있는 바에 입장할 때는 미리 알려드려요.'],
  ['정기 구독은 어떻게 해지하나요?', '토스 앱 전체에서 결제 내역을 연 뒤 혼술바 정기 구독을 해지하면 돼요. 해지해도 이번 기간이 끝날 때까지는 이용할 수 있고, 다시 이어가려면 같은 결제 내역에서 자동 결제를 켜면 돼요.'],
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
function faceSignature(face) {
  const box = faceBox(face);
  const landmarks = face.landmarks || [];
  return { box, points: landmarks.map(([x, y]) => [(x - box.left) / box.width, (y - box.top) / box.height]) };
}
function faceSimilarity(first, second) {
  if (!first?.points?.length || first.points.length !== second?.points?.length) return 0;
  const pointDistance = first.points.reduce((sum, point, index) => sum + Math.hypot(point[0] - second.points[index][0], point[1] - second.points[index][1]), 0) / first.points.length;
  const aspectDistance = Math.abs((first.box.width / first.box.height) - (second.box.width / second.box.height));
  return Math.max(0, 1 - pointDistance * 2.2 - aspectDistance * 0.25);
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
  if (!Number.isFinite(probability) || probability < 0.82) return false;
  const sizeW = box.width / width;
  const sizeH = box.height / height;
  if (sizeW < 0.2 || sizeH < 0.26 || sizeW > 0.95 || sizeH > 0.95) return false;
  const aspect = box.width / box.height;
  if (aspect < 0.52 || aspect > 1.38) return false;
  const centerY = (box.top + box.height / 2) / height;
  if (centerY < 0.12 || centerY > 0.72) return false;
  if (sizeH < 0.32 && (box.top + box.height) / height < 0.3) return false;
  const landmarks = face.landmarks || [];
  if (landmarks.length < 4) return false;
  const [rightEye, leftEye, nose, mouth] = landmarks;
  if (![rightEye, leftEye, nose, mouth].every(point => Array.isArray(point) && point.length >= 2)) return false;
  const relY = (y) => (y - box.top) / box.height;
  const eyeY = (rightEye[1] + leftEye[1]) / 2;
  if (relY(eyeY) > 0.48 || relY(mouth[1]) < 0.5) return false;
  if (relY(mouth[1]) - relY(eyeY) < 0.24) return false;
  const eyeDist = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]);
  if (eyeDist < box.width * 0.22 || eyeDist > box.width * 0.66) return false;
  if (Math.abs(leftEye[1] - rightEye[1]) > box.height * 0.16) return false;
  if (mouth[1] < eyeY + box.height * 0.18) return false;
  if (nose[1] <= eyeY || nose[1] >= mouth[1]) return false;
  const midX = (leftEye[0] + rightEye[0]) / 2;
  if (Math.abs(nose[0] - midX) > box.width * 0.22) return false;
  if (Math.abs(mouth[0] - midX) > box.width * 0.26) return false;
  return true;
}
function faceRegionLooksLikeSkin(canvas, face) {
  const stats = regionStats(canvas, cheekRect(face)) || regionStats(canvas, innerFaceRect(face));
  if (!stats) return false;
  const mean = (stats.meanR + stats.meanG + stats.meanB) / 3;
  if (mean < 48 || mean > 242) return false;
  if (stats.meanB > stats.meanR + 8) return false;
  if (stats.meanR - stats.meanB < 5 && mean < 120) return false;
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
  let samples = 0, flat = 0, exact = 0, graySum = 0, graySq = 0, rSum = 0, gSum = 0, bSum = 0, lapSum = 0;
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
      rSum += r; gSum += g; bSum += b;
      graySum += gray; graySq += gray * gray;
      lapSum += Math.abs(4 * gray - left - grayRight - up - grayDown);
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (Math.abs(gray - grayRight) + Math.abs(gray - grayDown) < 6) flat += 1;
      if (colorDelta <= 3) exact += 1;
      samples += 1;
    }
  }
  if (samples < 30) return null;
  return {
    samples,
    flatRatio: flat / samples,
    exactRatio: exact / samples,
    colorDensity: colors.size / samples,
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
  const faceStats = regionStats(canvas, innerFaceRect(face));
  const cheekStats = regionStats(canvas, cheekRect(face));
  const stats = cheekStats || faceStats;
  if (!stats) return false;
  const painted = stats.colorDensity < 0.048 && (stats.exactRatio > 0.2 || stats.flatRatio > 0.36);
  const simpleBackground = cornerBackgroundStats(canvas).minStd < 4;
  const obviousPaint = stats.exactRatio > 0.4 && stats.colorDensity < 0.055 && stats.flatRatio > 0.5;
  return obviousPaint || (painted && simpleBackground);
}
function identityPoints(face) {
  const [rightEye, leftEye, nose, mouth] = face.landmarks || [];
  if (![rightEye, leftEye, nose, mouth].every(point => Array.isArray(point) && point.length >= 2)) return null;
  const originX = (rightEye[0] + leftEye[0]) / 2;
  const originY = (rightEye[1] + leftEye[1]) / 2;
  const scale = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]) || 1;
  return [rightEye, leftEye, nose, mouth].map(([x, y]) => [(x - originX) / scale, (y - originY) / scale]);
}
function facesLookLikeSamePerson(profileCanvas, profileFace, cameraCanvas, cameraFace) {
  if (looksLikeIllustration(profileCanvas, profileFace)) return false;
  const first = identityPoints(profileFace);
  const second = identityPoints(cameraFace);
  if (!first || !second) return false;
  const pointDistance = first.reduce((sum, point, index) => sum + Math.hypot(point[0] - second[index][0], point[1] - second[index][1]), 0) / first.length;
  return pointDistance <= 0.4;
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
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요. 다른 사진을 골라주세요.')); };
    image.src = url;
  });
}
const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

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
  const [facing, setFacing] = useState(0);
  const [audioFacing, setAudioFacing] = useState(0);
  const [waveSent, setWaveSent] = useState([]);
  const [focusSubscription, setFocusSubscription] = useState(false);
  const [region, setRegion] = useState('서울');
  const [sheet, setSheet] = useState(null);
  const [previewRoom, setPreviewRoom] = useState(null);
  const [previews, setPreviews] = useState({});
  const [profile, setProfile] = useState({ nickname: '', gender: null, photo: null });
  const [photoDraft, setPhotoDraft] = useState(null);
  const [draftVerified, setDraftVerified] = useState(false);
  const [photoCheck, setPhotoCheck] = useState('idle');
  const [devSubscription, setDevSubscription] = useState(null);
  const [verificationState, setVerificationState] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
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
  const upload = useRef(null);
  const cameraVideo = useRef(null);
  const cameraCanvas = useRef(null);
  const cameraStream = useRef(null);
  const faceModel = useRef(null);
  const faceModelLoading = useRef(null);
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
  const stateHandler = useRef(null);

  const member = server?.member || null;
  const me = member?.id;
  const myPhoto = assetUrl(member?.photo) || null;
  const visit = server?.visit || null;
  const elapsed = Math.max(0, Math.floor((now - syncedAt) / 1000));
  const tick = (value, host) => host ? value : Math.max(0, value - elapsed);
  const seat = visit?.seat ?? 0;
  const guests = useMemo(() => (server?.guests || []).map(g => ({ ...g, photo: assetUrl(g.photo) })), [server?.guests]);
  const room = visit ? { region: visit.region, number: visit.number, count: guests.length + 1 } : entryRoom;
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
  const seconds = visit ? tick(visit.seconds, visit.seat === 11) : 0;
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
  const profileVerified = !!profile.photo && (photoDraft ? draftVerified : !!member?.photoChecked);
  const nicknameError = validateNickname(profile.nickname || '');
  const subscription = !!member?.subscribed || !!devSubscription;
  const subscriptionCancelAt = subscription && (member?.subAutoRenew === false || devSubscription?.cancelAt) ? (member?.subExpiresAt || devSubscription?.expiresAt) : null;
  const gains = useMemo(() => Object.fromEntries(guests.map(g => {
    if (!soundOn || mutedGuests.includes(g.id)) return [g.id, 0];
    const broadcast = g.speaker && !partners.me && !partners[g.id];
    return [g.id, broadcast ? 1 : audioGain({ id: 'me', seat }, g, audioFacing, partners, mutedGuests)];
  })), [guests, soundOn, mutedGuests, partners, seat, audioFacing]);
  const iceServers = useMemo(() => config?.iceServers?.length ? config.iceServers : DEFAULT_ICE, [config]);
  const sending = voice.mic && (seconds > 0 || seat === 11) ? voice.stream : null;
  const mesh = useMesh({ enabled: screen === 'bar' && !!me, selfId: me, peerIds: guests.map(g => g.id), stream: sending, iceServers, gains });
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
    const before = previousState.current;
    previousState.current = state;
    setServer(state); setSyncedAt(Date.now()); setNow(Date.now());
    setScreen(current => ['loading', 'onboarding', 'lobby', 'bar'].includes(current) ? (state.visit ? 'bar' : 'lobby') : current);
    if (!before) return;
    if (before.visit && !state.visit && !leaving.current) { voice.stop(); setSpeaker(false); setSheet(null); setToast('이용시간이 끝나 바에서 나왔어요. 다시 입장해 주세요.'); }
    const seen = new Set((before.notifications || []).map(n => n.id));
    const arrived = (state.notifications || []).filter(n => !seen.has(n.id) && !n.read_at);
    if (arrived.length) { setToast(`${arrived[0].title} · ${arrived[0].body}`); playCue('notification'); }
    const incomingBefore = new Set((before.requests || []).filter(r => r.receiver === state.member?.id).map(r => r.id));
    if ((state.requests || []).some(r => r.receiver === state.member?.id && !incomingBefore.has(r.id))) playCue('request');
    const sent = (before.requests || []).find(r => r.sender === state.member?.id && r.kind === 'swap');
    if (sent && !(state.requests || []).some(r => r.id === sent.id)) {
      setToast(state.visit && before.visit && state.visit.seat !== before.visit.seat ? '요청을 수락했어요. 500P를 보내고 자리를 바꿨어요' : '상대가 요청을 받지 않았어요. 포인트는 사용되지 않았어요.');
    }
    const partnerBefore = Object.keys(before.partners || {}).includes(state.member?.id);
    const partnerNow = Object.keys(state.partners || {}).includes(state.member?.id);
    if (!partnerBefore && partnerNow) setToast('옆자리와 대화를 시작했어요. 언제든 전체 대화로 돌아갈 수 있어요.');
    if (partnerBefore && !partnerNow) setToast('전체 대화로 돌아왔어요.');
  };

  async function run(action, data, extra = {}) {
    const id = ++sequence.current;
    const response = await call(action, data, { after: signalCursor.current, limit: historyLimit, ...extra });
    const fresh = id > appliedSequence.current;
    if (fresh) appliedSequence.current = id;
    if (response.state) stateHandler.current(response.state, fresh);
    return response.result;
  }
  function fail(e) {
    if (e?.status === 401) { clearSession(); setServer(null); previousState.current = null; setScreen('onboarding'); setSheet(null); }
    setToast(e?.message || '요청을 완료하지 못했어요.');
  }

  useEffect(() => { getConfig().then(setConfig).catch(() => setConfig({})); }, []);
  useEffect(() => {
    if (screen !== 'loading') return;
    run('state').then(() => restorePendingOrders()).catch(e => { if (e.status === 401) fail(e); else { setToast(e.message); setScreen('onboarding'); } });
  }, []);
  useEffect(() => {
    if (!['lobby', 'bar'].includes(screen)) return undefined;
    let stopped = false; let timer;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden && !polling.current) {
        polling.current = true;
        try { await run(screen === 'bar' ? 'heartbeat' : 'state', screen === 'bar' ? { speaker, mic: voice.mic } : undefined); } catch (e) { if (e.status === 401) fail(e); }
        polling.current = false;
      }
      timer = setTimeout(loop, screen === 'bar' ? 2000 : 6000);
    };
    timer = setTimeout(loop, screen === 'bar' ? 800 : 6000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [screen, speaker, voice.mic]);
  useEffect(() => { if (screen === 'lobby' || screen === 'bar') run('state').catch(() => {}); }, [historyLimit]);

  async function loadFaceModel() {
    if (faceModel.current) return faceModel.current;
    if (!faceModelLoading.current) faceModelLoading.current = blazeface.load();
    faceModel.current = await faceModelLoading.current;
    return faceModel.current;
  }

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
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!newRoom) return; const timer = setTimeout(() => setNewRoom(null), 6000); return () => clearTimeout(timer); }, [newRoom]);
  useEffect(() => {
    if (sheet !== 'shop' || !focusSubscription) return;
    const timer = setTimeout(() => {
      subscriptionSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusSubscription(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [sheet, focusSubscription]);
  useEffect(() => {
    if (sheet !== 'verify-profile') {
      cameraStream.current?.getTracks().forEach(track => track.stop());
      cameraStream.current = null;
      const context = cameraCanvas.current?.getContext('2d');
      if (context && cameraCanvas.current) context.clearRect(0, 0, cameraCanvas.current.width, cameraCanvas.current.height);
      return;
    }
    let cancelled = false;
    setVerificationState('starting');
    setVerificationMessage('카메라를 준비하고 있어요.');
    if (!navigator.mediaDevices?.getUserMedia) {
      setVerificationState('unavailable');
      setVerificationMessage('이 환경에서는 카메라를 사용할 수 없어 얼굴 확인을 진행할 수 없어요.');
      return undefined;
    }
    const attachStream = stream => {
      if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      cameraStream.current = stream;
      const video = cameraVideo.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      loadFaceModel().then(() => {
        if (!cancelled) { setVerificationState('ready'); setVerificationMessage('점선 안에 얼굴을 맞춘 뒤 촬영해 주세요.'); }
      }).catch(() => {
        if (!cancelled) { setVerificationState('unavailable'); setVerificationMessage('얼굴 확인을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
      });
    };
    const startCamera = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false }).then(attachStream).catch(() => {
      if (!cancelled) {
        setVerificationState('unavailable');
        setVerificationMessage('카메라 권한이 필요해요. 허용하면 이 화면에서 바로 촬영할 수 있어요.');
      }
    });
    if (insideToss() && typeof getPermission === 'function') {
      getPermission({ name: 'camera', access: 'access' }).then(status => {
        if (cancelled) return;
        if (status === 'allowed') return startCamera();
        if (typeof openPermissionDialog === 'function') return openPermissionDialog({ name: 'camera', access: 'access' }).then(startCamera).catch(() => startCamera());
        return startCamera();
      }).catch(startCamera);
    } else startCamera();
    return () => { cancelled = true; };
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
    } catch (e) { setToast(e?.message || '로그인하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function submitInquiry() {
    if (busy) return;
    setBusy(true);
    try {
      await run('ticket', { kind: inquiryType === '서비스 신고' ? 'report' : 'inquiry', category: inquiryType, message: inquiryMessage.trim() });
      setSheet(null); setInquiryMessage(''); setToast('문의가 접수됐어요. 답변이 오면 알려드릴게요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitReport() {
    if (busy || !selectedGuest) return;
    setBusy(true);
    try {
      await run('ticket', { kind: 'report', category: reportReason, message: reportMessage.trim() || reportReason, targetId: selectedGuest.id });
      if (activeFocus === selectedGuest.id) endFocus();
      setMutedGuests(v => [...new Set([...v, selectedGuest.id])]);
      setSheet(null); setToast('신고가 접수됐어요. 이 손님의 목소리는 이제 들리지 않아요.'); setReportReason(''); setReportMessage('');
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
    if (item.type === 'inquiry') { setSelectedInquiry(inquiries.find(entry => entry.id === item.inquiryId) || null); setSheet('inquiry-detail'); return; }
    if (item.region) { setRegion(item.region); setSelectedRoom({ region: item.region, number: item.number }); setSheet(null); setToast(`${item.region} ${item.number}호점을 선택했어요.`); return; }
    setSheet(null);
  }
  function resetConversation() { setFacing(0); setAudioFacing(0); }
  async function requestFocus(target) {
    if (!target || !adjacent(seat, target.seat) || partners[target.id] || mutedGuests.includes(target.id) || seconds === 0 || focusRequest || activeFocus) return;
    try { await run('request', { targetId: target.id, kind: 'focus' }); setSheet(null); setToast('옆자리와 대화를 요청했어요. 수락하면 시작해요.'); }
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
    try { await run('request', { targetId: target.id, kind: 'wave' }); setWaveSent(v => [...v, target.id]); setToast('인사를 남겼어요. 대화가 끝나면 확인할 수 있어요.'); }
    catch (e) { setError(e.message); }
  }
  function pushTemplate() {
    return config?.pushAvailableTemplate || 'honsulbar-seat-open';
  }
  function agreementType(result) {
    return result?.type || result?.agreementResult || result;
  }
  function askPushAgreement() {
    return new Promise(resolve => {
      if (!insideToss()) { resolve('skipped'); return; }
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
  async function requestWaitlist(target) {
    const targetRegion = target.region || region;
    const key = `${targetRegion}:${target.number}`;
    if (sheet === 'preview') setSheet(null);
    if (waitlist.includes(key)) { setToast('빈자리가 생기면 알려드릴게요.'); return; }
    const consent = await askPushAgreement();
    if (consent === 'rejected') { setToast('알림에 동의해야 빈자리를 알려드릴 수 있어요.'); return; }
    try { await run('waitlist', { region: targetRegion, number: target.number }); setToast(consent === 'agreed' ? '빈자리가 생기면 알림으로 알려드릴게요.' : '빈자리가 생기면 알려드릴게요.'); }
    catch (e) { setToast(e.message); }
  }
  async function openPushAgreement() {
    const consent = await askPushAgreement();
    if (consent === 'agreed') setToast('빈자리 알림에 동의했어요.');
    else if (consent === 'rejected') setToast('알림에 동의하지 않으면 빈자리 푸시를 받을 수 없어요.');
    else setToast('이 기기에서는 토스 앱 알림 설정에서 동의할 수 있어요.');
  }
  async function attendance() {
    if (wallet.attendanceDate === today || adInProgress) return;
    setAdInProgress(true);
    let claim;
    try { claim = await run('ad-start'); } catch (e) { setAdInProgress(false); setToast(e.message); return; }
    let finished = false;
    const finish = async () => {
      if (finished) return; finished = true;
      try { await run('ad-claim', { id: claim.id }); setSheet('shop'); setToast('광고 시청 완료 · 출석 포인트 1,000P를 받았어요.'); }
      catch (e) { setToast(e.message); }
      finally { setAdInProgress(false); }
    };
    const stop = message => { if (finished) return; finished = true; setAdInProgress(false); setToast(message); };
    const adGroupId = config?.adGroupId;
    if (adGroupId && loadFullScreenAd.isSupported?.() && showFullScreenAd.isSupported?.()) {
      setToast('광고를 불러오고 있어요. 끝까지 시청하면 포인트가 자동으로 지급돼요.');
      let rewarded = false;
      loadFullScreenAd({
        options: { adGroupId },
        onEvent: event => {
          if (event.type !== 'loaded') return;
          showFullScreenAd({
            options: { adGroupId },
            onEvent: shown => {
              if (shown.type === 'userEarnedReward') { rewarded = true; finish(); }
              else if (shown.type === 'dismissed' && !rewarded) stop('광고를 끝까지 보면 출석 포인트를 받을 수 있어요.');
              else if (shown.type === 'failedToShow') stop('광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
            },
            onError: () => stop('광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'),
          });
        },
        onError: () => stop('광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'),
      });
    } else if (config?.devLogin) {
      setToast('테스트 환경이에요. 6초 뒤 출석 포인트가 지급돼요.');
      setTimeout(finish, 6000);
    } else stop('광고를 준비 중이에요. 잠시 후 다시 시도해 주세요.');
  }
  function buyPoints() {
    const sku = Object.entries(config?.products || {}).find(([, item]) => item.points === shopPack.points)?.[0];
    if (!sku || !insideToss() || typeof IAP?.createOneTimePurchaseOrder !== 'function') { setToast('결제 상품을 준비 중이에요. 잠시 후 다시 시도해 주세요.'); return; }
    if (busy) return;
    setBusy(true);
    let cleanup;
    const done = () => { try { cleanup?.(); } catch {} setBusy(false); };
    try {
      cleanup = IAP.createOneTimePurchaseOrder({
        options: {
          sku,
          processProductGrant: async ({ orderId }) => { try { await run('purchase', undefined, { orderId }); return true; } catch { return false; } },
        },
        onEvent: event => { if (event.type === 'success') { done(); setSheet('shop'); setToast(`${shopPack.points.toLocaleString()}P를 충전했어요.`); } },
        onError: err => { done(); if (err?.code !== 'USER_CANCELED') setToast('결제를 완료하지 못했어요. 결제가 됐다면 잠시 후 자동으로 충전돼요.'); },
      });
    } catch { done(); setToast('결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  }
  function requestPreview(target) {
    const current = rooms[target.region || region]?.find(room => room.number === target.number) || target;
    if (!(current.count > 0)) return;
    setPreviewRoom({ ...target, region: target.region || region }); previewLock.current = false; open('preview');
  }
  async function buyPreview() {
    if (previewLock.current || previews[previewKey]) return;
    const current = rooms[previewRoom.region].find(r => r.number === previewRoom.number);
    if (!current?.count) { setError('아직 손님이 없어요. 포인트는 사용되지 않았어요.'); return; }
    if (!subscription && wallet.balance < 500) { setError('500P가 필요해요. 자리 양보로 포인트를 받을 수 있어요.'); return; }
    previewLock.current = true;
    try {
      const list = await run('preview', { region: previewRoom.region, number: previewRoom.number });
      setPreviews(v => ({ ...v, [previewKey]: { guests: (list || []).map(g => ({ ...g, photo: assetUrl(g.photo) })), at: Date.now() } }));
      setToast(subscription ? '구독 이용 · 지금 머무는 손님을 확인해요' : '500P 사용 · 지금 머무는 손님을 확인해요');
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
    if (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`]) { setToast('같은 사람의 같은 자리에는 한 번만 부탁할 수 있어요.'); return; }
    try { await run('request', { targetId: selectedGuest.id, kind: 'swap' }); setSheet(null); setToast('자리 양보를 부탁했어요. 수락하면 500P가 사용돼요.'); }
    catch (e) { setError(e.message); }
  }
  function cancelOutgoing() { if (outgoing) run('cancel', { id: outgoing.id }).then(() => setToast('요청을 취소했어요.')).catch(fail); }
  function open(value) { setError(''); orderLock.current = false; setSheet(value); }
  function openProfileEditor(source = member) {
    setProfile({ nickname: source?.photo ? source.nickname : (source?.nickname && source.nickname !== '느긋한 구름' ? source.nickname : randomNickname()), gender: source?.gender || null, photo: assetUrl(source?.photo) || null });
    setPhotoDraft(null); setDraftVerified(false); setPhotoCheck('idle');
    open('profile');
  }
  function closeSheet() { setSheet(null); setError(''); }
  async function saveProfile() {
    if (busy) return;
    setBusy(true);
    try {
      await run('profile', { nickname: profile.nickname.trim(), gender: profile.gender, ...(photoDraft ? { photo: photoDraft, photoChecked: draftVerified } : {}) });
      setPhotoDraft(null); setDraftVerified(false);
      setSheet(null); setToast('프로필을 저장했어요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function withdraw() {
    if (busy) return;
    setBusy(true);
    try {
      await run('withdraw');
      clearSession(); setServer(null); previousState.current = null; setSheet(null);
      try { localStorage.removeItem('honsulbar:onboarding:v1'); } catch {}
      setScreen('onboarding'); setToast('탈퇴가 완료됐어요. 그동안 이용해 주셔서 감사해요.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function openSubscriptionManager() { setFocusSubscription(true); open('shop'); }
  function requestSubscriptionChange() { open(subscription ? 'subscription-cancel-guide' : 'subscription-confirm'); }
  function startSubscription() {
    const localPreview = !insideToss() && (config?.devLogin || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
    if (localPreview) {
      setDevSubscription({ expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), cancelAt: null });
      setSheet('shop');
      setToast('테스트로 정기 구독을 시작했어요.');
      return;
    }
    const sku = config?.subscriptionSku || 'honsulbar_sub_monthly';
    if (!insideToss() || typeof IAP?.createSubscriptionPurchaseOrder !== 'function') { setToast('정기 구독을 준비 중이에요. 잠시 후 다시 시도해 주세요.'); return; }
    if (busy) return;
    setBusy(true);
    let cleanup;
    const done = () => { try { cleanup?.(); } catch {} setBusy(false); };
    try {
      cleanup = IAP.createSubscriptionPurchaseOrder({
        options: {
          sku,
          processProductGrant: async ({ orderId }) => { try { await run('purchase', undefined, { orderId }); return true; } catch { return false; } },
        },
        onEvent: event => { if (event.type === 'success') { done(); setSheet('shop'); setToast('정기 구독을 시작했어요. 입장·연장·미리보기에 포인트가 차감되지 않아요.'); } },
        onError: err => { done(); if (err?.code !== 'USER_CANCELED') setToast('구독을 완료하지 못했어요. 결제가 됐다면 잠시 후 자동으로 반영돼요.'); },
      });
    } catch { done(); setToast('구독을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  }
  function confirmSubscriptionChange() {
    if (!subscription) { startSubscription(); return; }
    setSheet('shop');
    setToast(subscriptionCancelAt ? '토스 앱 결제 내역에서 자동 결제를 다시 켜면 유지돼요.' : '토스 앱 결제 내역에서 구독을 해지하면 이 화면에 반영돼요.');
  }
  function subscriptionEndLabel() {
    const expiresAt = member?.subExpiresAt || devSubscription?.expiresAt;
    if (!expiresAt) return '이용 기간이 끝날 때';
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(expiresAt));
  }
  function proceedEntry(target) {
    setPendingEntry(null);
    setEntryRoom({ region: target.region || region, number: target.number, count: target.count });
    if (!member?.photo || !member?.gender) { openProfileEditor(); return; }
    setSelection('highball'); open('welcome');
  }
  function requestEntry(target, { ignoreReport } = {}) {
    if (!target) return;
    const regionKey = target.region || region;
    target = rooms[regionKey]?.find(r => r.number === target.number) || { ...target, region: regionKey };
    if ((target.count ?? 0) >= CAPACITY) return;
    if (!ignoreReport && target.hasReportedGuest) {
      setPendingEntry({ region: regionKey, number: target.number, count: target.count, hasReportedGuest: true });
      open('reported-entry');
      return;
    }
    proceedEntry({ ...target, region: regionKey });
  }
  async function confirmOrder() {
    if (orderLock.current) return;
    orderLock.current = true; setError('');
    try {
      if (isWelcome) {
        mesh.resume();
        await run('enter', { region: room.region, number: room.number, drinkId: selection });
        resetConversation(); setWaveSent([]); setSpeaker(false); setSoundOn(true); setMutedGuests([]);
      } else await run('order', { drinkId: selection });
      setSheet(null);
      setToast(isWelcome ? `${chosen.name}, ${price.toLocaleString()} 포인트로 ${chosen.minutes}분 이용을 시작했어요.` : `${price.toLocaleString()} 포인트 사용 · ${chosen.minutes}분 연장했어요`);
    } catch (e) { setError(e.message); }
    finally { orderLock.current = false; }
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
    return (faces || []).some(face => isLikelyRealFace(face, canvas.width, canvas.height) && faceRegionLooksLikeSkin(canvas, face) && !looksLikeIllustration(canvas, face));
  }
  async function choosePhoto(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하의 JPG, PNG, WebP 사진을 골라주세요.'); return; }
    const requestId = ++photoInspect.current;
    const started = Date.now();
    setError('');
    setDraftVerified(false);
    setPhotoDraft(null);
    setPhotoCheck('checking');
    try {
      const photo = await resizePhoto(file);
      if (requestId !== photoInspect.current) return;
      setProfile(v => ({ ...v, photo }));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const ok = await inspectProfilePhoto(photo);
      const remain = 1600 - (Date.now() - started);
      if (remain > 0) await new Promise(resolve => setTimeout(resolve, remain));
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
      setError(e.message === '사진을 읽지 못했어요. 다른 사진을 골라주세요.' ? e.message : '사진을 확인하지 못했어요. 다른 사진을 골라 주세요.');
    }
  }
  async function commitMove(index) {
    try { await run('move', { seat: index }); resetConversation(); setSheet(null); }
    catch (e) { setSheet(null); setToast(e.message); }
  }
  function requestMove(index) {
    if (seconds === 0 && index !== 11) { open('menu'); return; }
    if (seat !== 11 && guests.some(g => g.seat !== 11 && Math.abs(g.seat - seat) === 1)) {
      setPendingSeat(index); open('move');
    } else commitMove(index);
  }
  async function leave() {
    resetConversation();
    voice.stop(); setSpeaker(false); setSoundOn(true); setSheet(null);
    leaving.current = true;
    try { await run('leave'); setEntryRoom(null); } catch (e) { setToast(e.message); }
    finally { leaving.current = false; }
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
  const recommended = localRooms.filter(r => r.count < CAPACITY).sort((a,b) => Math.abs(a.count - 7) - Math.abs(b.count - 7))[0];
  const guestsTalking = !!guest;
  const audible = guest && gains[guest.id] > 0;
  const selected = selectedRoom?.region === region ? localRooms.find(r=>r.number===selectedRoom.number) : null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(now));
  const guestSeconds = person => tick(person.seconds, person.seat === 11);

  function verifyProfilePhoto(delay = 0) {
    setTimeout(() => {
      setDraftVerified(true);
      setVerificationState('verified');
      setVerificationMessage('얼굴을 확인했어요.');
    }, delay);
  }
  async function captureVerification() {
    const video = cameraVideo.current;
    const canvas = cameraCanvas.current;
    if (!video || !canvas || video.readyState < 2) { setVerificationMessage('카메라가 준비될 때까지 잠시만 기다려 주세요.'); return; }
    const startedAt = Date.now();
    const finish = (message) => setTimeout(() => { setVerificationState('ready'); setVerificationMessage(message); }, Math.max(0, 2000 - (Date.now() - startedAt)));
    setVerificationState('checking');
    setVerificationMessage('촬영한 얼굴을 확인하고 있어요.');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const model = await loadFaceModel();
      const cameraFrames = [];
      const liveFaces = [];
      let still = null;
      for (let frame = 0; frame < 3; frame += 1) {
        if (frame > 0) await new Promise(resolve => setTimeout(resolve, 180));
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const faces = await model.estimateFaces(canvas, false);
        if (!faces.length) { finish('얼굴을 찾지 못했어요. 화면을 바라보고 다시 촬영해 주세요.'); return; }
        const face = faces.sort((a, b) => faceBox(b).width - faceBox(a).width)[0];
        if (!faceIsWellFramed(face, canvas.width, canvas.height)) { finish('얼굴을 화면 가운데에 맞추고 조금 가까이에서 다시 촬영해 주세요.'); return; }
        cameraFrames.push(faceSignature(face));
        liveFaces.push(face);
        if (frame === 1) {
          still = document.createElement('canvas');
          still.width = canvas.width;
          still.height = canvas.height;
          still.getContext('2d').drawImage(canvas, 0, 0);
        }
      }
      const cameraSimilarity = faceSimilarity(cameraFrames[0], cameraFrames[2]);
      if (cameraSimilarity < 0.72) { finish('얼굴이 흔들렸어요. 화면을 바라보고 다시 촬영해 주세요.'); return; }
      if (!profile.photo) { finish('프로필 사진을 다시 등록해 주세요.'); return; }
      const image = new Image(); image.src = profile.photo; await image.decode();
      const profileCanvas = document.createElement('canvas');
      profileCanvas.width = image.naturalWidth || image.width;
      profileCanvas.height = image.naturalHeight || image.height;
      profileCanvas.getContext('2d').drawImage(image, 0, 0);
      const profileFaces = await model.estimateFaces(profileCanvas, false);
      if (!profileFaces.length) { finish('프로필 사진에서 얼굴을 찾지 못했어요. 얼굴이 잘 보이는 사진을 등록해 주세요.'); return; }
      const profileFace = profileFaces.sort((a, b) => faceBox(b).width - faceBox(a).width)[0];
      if (looksLikeIllustration(profileCanvas, profileFace)) { finish('얼굴이 잘 보이는 사진을 등록해 주세요.'); return; }
      if (!still || !facesLookLikeSamePerson(profileCanvas, profileFace, still, liveFaces[1])) { finish('프로필 사진과 얼굴이 비슷하지 않아요.\n본인 사진으로 다시 촬영해 주세요.'); return; }
    } catch { finish('얼굴 확인 중 문제가 생겼어요. 얼굴을 화면 가운데에 맞추고 다시 촬영해 주세요.'); return; }
    verifyProfilePhoto(Math.max(0, 2000 - (Date.now() - startedAt)));
  }

  if (screen === 'onboarding') return <main className="app onboarding-screen">
    <div className="onboarding-scroll">
      <img className="onboarding-logo" src="/honsulbar-logo.png" alt="혼술바" />
      <p className="eyebrow">혼술바</p>
      <h1>오늘은 어디서<br/>이야기해 볼까요?</h1>
      <p className="onboarding-lead">지역별 혼술바에서 목소리로 가볍게 대화해요.</p>
      <div className="onboarding-points">
        <div><span>01</span><p><strong>지역과 호점 선택</strong><small>원하는 지역의 빈자리를 골라요.</small></p></div>
        <div><span>02</span><p><strong>음료로 30분 입장</strong><small>입장 시 포인트가 차감돼요.</small></p></div>
        <div><span>03</span><p><strong>소리 집중 방향 조절</strong><small>듣고 싶은 쪽에 귀 기울여요.</small></p></div>
      </div>
      <div className="onboarding-notice">만 19세 이상만 이용할 수 있어요.</div>
      <Button size="xlarge" display="block" disabled={busy} onClick={completeOnboarding}>{busy ? '로그인하는 중…' : '시작하기'}</Button>    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;

  if (screen === 'loading') return <main className="app onboarding-screen"><div className="onboarding-scroll"><img className="onboarding-logo" src="/honsulbar-logo.png" alt="혼술바" /><p className="onboarding-lead">혼술바를 여는 중이에요…</p></div></main>;

  return <main className="app">
    <header>
      {screen === 'bar' ? <button className="icon-button" aria-label="바 나가기" onClick={()=>open('leave')}><ArrowLeft size={21}/></button> : <button className="point-entry" aria-label={`포인트 상점, ${wallet.balance.toLocaleString()}P`} onClick={()=>open('shop')}><Coins size={17}/><span>{wallet.balance.toLocaleString()}<small> P</small></span></button>}
      <div className="header-actions"><button className="header-icon-button" aria-label="설정" onClick={()=>open('settings')}><Settings size={18}/></button><button className="notification-button" aria-label={`알림 ${notifications.length}개`} onClick={openNotifications}><Bell size={18}/>{notifications.some(item=>item.unread)&&<i/>}</button><button className="profile-button" aria-label="내 프로필" onClick={()=>openProfileEditor()}>{myPhoto ? <img src={myPhoto} alt="내 프로필"/> : <UserRound size={18}/>}</button></div>
    </header>
    {screen === 'lobby' ? <section className="lobby">
      <div className="lobby-heading"><h1>오늘은 어디서 마실까요?</h1></div>
      <div className="regions" aria-label="지역">{REGIONS.map(r=><Button key={r} size="small" variant="weak" color={r===region?'primary':'dark'} aria-pressed={r===region} onClick={()=>{setRegion(r);setSelectedRoom(null);}}>{r}</Button>)}<Button className="region-request-button" size="small" variant="weak" color="dark" onClick={()=>{setRequestedRegion('');setCustomRegion('');setShowCustomRegion(false);open('region-request');}}>+ 지역 추가 요청</Button></div>
      <div className="list-heading"><span><i className="green-dot"/>{localRooms.reduce((sum,r)=>sum+r.count,0)}명 머무는 중</span></div>
      {newRoom && <div className="new-room-notice" role="status">{region} {newRoom}호점이 열렸어요.</div>}
      <div className="room-list" role="group" aria-label="입장할 호점 선택">{localRooms.map(r=><div className={`room-row ${selected?.number===r.number?'selected':''}`} key={r.number}>
        <button className="room-select" aria-pressed={selected?.number===r.number} aria-label={`${region} ${r.number}호점 선택${r.count===CAPACITY?', 만석':''}`} onClick={()=>setSelectedRoom({region,number:r.number})}>
          <span className="selection-dot" aria-hidden="true">{selected?.number===r.number&&<Check size={13}/>}</span>
          <strong>{region} {r.number}호점</strong>
          <Badge size="small" variant="weak" color={r.count===CAPACITY?'elephant':'blue'}>{r.count===CAPACITY?'만석':r.count===0?'새로 열림':'입장 가능'}</Badge>
          <span className="room-count"><b>{r.count}</b> / 12</span>
        </button>
        {selected?.number===r.number&&<div className="selected-room-detail"><span>{r.count===CAPACITY?'빈자리가 생기면 알려드려요':`빈자리 ${CAPACITY-r.count}석`}</span>{r.count===CAPACITY?<div className="room-detail-actions"><button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'미리보기 보기':'미리보기 · 500P'}</button><button onClick={()=>requestWaitlist(r)}><Bell size={14}/>{waitlist.includes(`${region}:${r.number}`)?'알림 신청됨':'빈자리 알림'}</button></div>:r.count>0&&<button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'구매한 미리보기':'미리보기 · 500P'}</button>}</div>}
      </div>)}</div>
      <p className="branch-note">자리가 다 차면 다음 호점이 열려요.</p>
      <div className="lobby-footer">
        <p className="entry-benefit">입장 시 포인트가 차감돼요.</p>
        <div className="entry-actions"><Button color="dark" variant="weak" size="xlarge" disabled={!recommended} onClick={()=>requestEntry(recommended)}>빠른 입장</Button><Button size="xlarge" disabled={!selected||selected.count===CAPACITY} onClick={()=>requestEntry(selected)}>{selected?selected.count===CAPACITY?'만석이에요':`${region} ${selected.number}호점 입장하기`:'호점을 선택해 주세요'}</Button></div>
      </div>
    </section> : <section className="bar-screen">
      <div className="room-heading"><div><button className="room-title" onClick={() => open('leave')}>{room.region} {room.number}호점 <ChevronDown size={17}/></button></div><span className="occupancy"><i className="green-dot"/>{guests.length+1}<span> / 12</span></span></div>
      <div className={`time-strip ${seconds < 300 && seat !== 11 ? 'time-low' : ''}`}><Clock3 size={16}/><span>{seat === 11 ? '사장 자리' : '남은 시간'}</span><strong>{seat === 11 ? '시간 제한 없음' : time}</strong><button aria-label="메뉴판 열고 시간 연장" onClick={() => {setSelection(wallet.drinkId || 'highball'); open('menu');}}><Plus size={18}/></button></div>
      <div className="bar-space"><div className="bar-rug"/><div className="wood-bar"><i className="table-lamp lamp-one"/><i className="table-lamp lamp-two"/><i className="table-lamp lamp-three"/></div>
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
            <button className={`seat ${occupied ? `occupied ${mine ? profile.gender : person.gender}` : 'empty'} ${mine ? 'mine' : ''} ${talking ? 'speaking' : ''}`} aria-label={mine ? '내 자리' : person ? `${i+1}번 손님 프로필` : i === 11 ? '빈 사장 자리로 이동' : `${i+1}번 빈자리로 이동`} onClick={() => mine ? openProfileEditor() : person ? (setSelectedGuest(person), open('guest')) : requestMove(i)}>{occupied ? <img src={mine ? myPhoto : person.photo} alt={mine ? '내 얼굴' : '손님 얼굴'}/> : <Plus size={18}/>}</button>
            {occupied && <span className="seat-drink" title={DRINKS.find(d => d.id === personDrink)?.name}><Glass id={personDrink} seconds={leftTime} host={i===11}/><span className="sr-only">{DRINKS.find(d => d.id === personDrink)?.name}, {i===11?'시간 제한 없음':`${Math.ceil(leftTime/60)}분 남음`}</span></span>}
            {paired&&<span className="pair-marker" title="서로 속삭이는 중"><MessageCircleMore size={12} style={{transform:'scaleX(-1)'}}/><span className="sr-only">서로 속삭이는 중</span></span>}{!mine&&person&&mutedGuests.includes(person.id)?<span className="muted-marker" title={reportedIds.has(person.id)?'신고로 들리지 않아요':'음소거됨'}><VolumeX size={12}/><span className="sr-only">{reportedIds.has(person.id)?'신고로 들리지 않아요':'음소거됨'}</span></span>:!mine&&person&&person.mic===false?<span className="muted-marker mic-off-marker" title="마이크 꺼짐"><MicOff size={12}/><span className="sr-only">마이크 꺼짐</span></span>:null}{talking && <Waves/>}{mine && <span className="me-label">나</span>}{i === 11 && <span className="host-label">{occupied ? '사장' : '사장 자리'}</span>}
          </div>;
        })}
      </div>
      <div className="conversation-status">{activeFocus?'1:1 대화 중 · 다른 사람에게는 들리지 않아요':voice.mic&&voice.level>.06?'지금 이야기하고 있어요':guestsTalking&&partners[guest?.id]?'두 손님이 1:1로 대화하고 있어요':guestsTalking?(audible?'가까운 자리에서 이야기하고 있어요':'저쪽 자리에서 이야기하고 있어요'):'빈자리를 누르면 옮길 수 있어요'}</div>
      <div className="direction-control">
        {activeFocus?<div className="focus-active"><MessageCircleMore size={17}/><span>1:1 대화 중 · 다른 사람에게는 들리지 않아요</span><button onClick={endFocus}>전체 대화로</button></div>:focusRequest?<div className="focus-active"><span>대화 요청에 답을 기다려요</span><button onClick={cancelFocus}>취소</button></div>:incomingFocus?<div className="focus-active"><MessageCircleMore size={17}/><span>옆자리 손님이 둘만의 대화를 요청했어요</span><button onClick={()=>respondFocus(false)}>거절</button><button onClick={()=>respondFocus(true)}>수락</button></div>:<>
          <div className="direction-label"><span>소리 집중 방향</span><output>{facing===0?'양쪽 고르게':`${facing<0?'왼쪽':'오른쪽'}으로 ${Math.abs(facing)}°`}</output></div>
          <div className="direction-presets"><button className={facing < -15 ? 'active' : ''} onClick={()=>setFacing(-60)}>왼쪽</button><button className={Math.abs(facing) <= 15 ? 'active' : ''} onClick={()=>setFacing(0)}>양쪽</button><button className={facing > 15 ? 'active' : ''} onClick={()=>setFacing(60)}>오른쪽</button></div><div className="direction-slider"><span aria-hidden="true">왼쪽</span><input type="range" aria-label="대화 방향 각도" min="-90" max="90" step="15" value={facing} style={{'--range-progress':`${((facing + 90) / 180) * 100}%`}} onChange={e=>setFacing(Number(e.target.value))}/><span aria-hidden="true">오른쪽</span></div>
          <div className="neighbor-actions">{neighbors.length?neighbors.map(g=><button key={g.id} onClick={()=>{setSelectedGuest(g);open('guest');}}><ArrowLeftRight size={13}/>{g.seat<seat?'왼쪽':'오른쪽'} 옆자리{partners[g.id]?' · 대화 중':'와만 대화'}</button>):<span>{seat===11?'손님 자리에 앉으면 옆자리와 대화할 수 있어요':'바로 옆자리에 손님이 오면 둘이 대화할 수 있어요'}</span>}</div>
        </>}
      </div>
      {incoming && <button className="seat-offer incoming-offer" onClick={() => open('incoming')}><ArrowLeftRight size={18}/><span>자리 양보를 부탁받았어요<small>{incomingSeconds}초 안에 수락할 수 있어요</small></span><b>+500 P</b></button>}
      {outgoing && <div className="seat-offer"><Clock3 size={18}/><span>자리 양보 답변을 기다려요<small>수락 전에는 포인트가 차감되지 않아요</small></span><button onClick={cancelOutgoing}>취소</button></div>}
      <div className="current-drink"><Glass id={wallet.drinkId} seconds={seconds} host={seat===11}/><span className="current-drink-name"><b>{currentDrink?.name}</b><small>{seat===11?'시간 제한 없음':`${Math.ceil(seconds/60)}분 남음`}</small></span><button aria-label="포인트 상점" onClick={() => open('shop')}><Wallet size={13}/>{wallet.balance.toLocaleString()} P</button></div>
      {seconds === 0 && seat !== 11 && <p role="status" className="error">이용시간이 끝났어요. 한 잔 더 주문하고 머물러요.</p>}
      <div className="controls"><button className={voice.mic ? 'mic-active' : ''} aria-pressed={voice.mic} onClick={() => { mesh.resume(); if (seconds === 0 && seat !== 11) open('menu'); else voice.toggle(); }}>{voice.mic ? <Mic size={21}/> : <MicOff size={21}/>}<span>{voice.pending ? '연결 중' : voice.mic ? '마이크 켜짐' : '마이크 꺼짐'}</span></button><button className={speaker ? 'speaker-active' : ''} aria-pressed={speaker} onClick={toggleSpeaker}><Speaker size={21}/><span>{speaker ? '스피커 켜짐' : '스피커 꺼짐'}</span></button><button className={soundOn ? 'sound-active' : ''} aria-pressed={soundOn} onClick={() => {mesh.resume();setSoundOn(v=>!v);}}>{soundOn ? <Volume2 size={21}/> : <VolumeX size={21}/>}<span>{soundOn ? '소리 켜짐' : '소리 꺼짐'}</span></button><button className="order-control" onClick={() => {setSelection(wallet.drinkId || 'highball'); open('menu');}}><Wine size={21}/><span>한 잔 더</span></button></div>
    </section>}
      <BottomSheet open={!!sheet} onClose={closeSheet} ariaLabelledBy="sheet-title" className="app-bottom-sheet" maxHeight={['welcome','menu','shop','preview','profile','verify-profile','guest','settings','region-request'].includes(sheet) ? window.innerHeight * .92 : undefined}>
      <div className={`sheet sheet-compact ${sheet === 'guest' ? 'sheet-guest' : ''} ${sheet === 'profile' ? 'sheet-profile' : ''} ${sheet === 'region-request' ? 'sheet-region-request' : ''}`}><button className="close icon-button" aria-label="닫기" onClick={closeSheet}><X size={22}/></button>
      {(sheet === 'welcome' || sheet === 'menu') && <><p className="eyebrow">{isWelcome ? `${room?.region} ${room?.number}호점 입장` : '메뉴판'}</p><h2 id="sheet-title">{isWelcome ? '어떤 음료로 시작할까요?' : '한 잔 더 하고 갈까요?'}</h2><p className="sheet-description">{isWelcome ? (subscription ? '구독 중이면 입장에 포인트가 차감되지 않아요.' : '입장 시 포인트가 차감돼요.') : '주문한 잔은 내 사진 옆에 놓여요.'}</p><div className="menu">{DRINKS.filter(item => !isWelcome || item.minutes === 30).map(item => <button className={selection === item.id ? 'chosen' : ''} key={item.id} aria-pressed={selection === item.id} onClick={() => {setSelection(item.id);setError('');}}><div className="drink-illustration"><Glass id={item.id}/></div><span><strong>{item.name}</strong><small>{item.note}</small><em>{`+${item.minutes}분`}</em></span><span className="menu-price">{isWelcome ? `입장 ${item.price.toLocaleString()}P` : `${item.price.toLocaleString()} P`}{selection === item.id && <Check size={16}/>}</span></button>)}</div><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>{subscription ? '구독 이용' : (isWelcome ? '입장 후 남는 포인트' : '주문 후 남는 포인트')}<strong>{subscription ? '0 P' : `${Math.max(0,wallet.balance-price).toLocaleString()} P`}</strong></span></div><p className="digital-note">음료는 취향을 표현하는 아이템이에요.</p>{!subscription && wallet.balance<price?<><div className="insufficient-state"><strong>{(price-wallet.balance).toLocaleString()}P가 더 필요해요</strong><span>충전 후 {isWelcome ? '입장' : '주문'}할 수 있어요.</span></div><Button className="sheet-recharge-cta" size="xlarge" display="block" onClick={()=>open('shop')}>포인트 충전하기</Button><p className="footnote">포인트를 충전하면 선택한 음료로 바로 이용할 수 있어요.</p></>:<div className="sheet-inline-cta"><Button size="xlarge" display="block" onClick={confirmOrder}>{subscription ? (isWelcome ? `${chosen.minutes}분 입장하기` : `주문 · ${chosen.minutes}분 연장`) : (isWelcome ? `${price.toLocaleString()} 포인트로 ${chosen.minutes}분 입장하기` : `${price.toLocaleString()} 포인트로 주문 · ${chosen.minutes}분 연장`)}</Button><p className="footnote">{subscription ? '구독 기간에는 입장·연장에 포인트가 차감되지 않아요.' : (isWelcome ? '입장한 호점에서만 이용시간이 흐르고, 바를 나가면 이용이 끝나요.' : '주문을 누르면 포인트가 차감되고 이용시간이 늘어나요.')}</p></div>}</>}
      {sheet === 'preview' && previewRoom && <><p className="eyebrow">{previewRoom.region} {previewRoom.number}호점</p><h2 id="sheet-title">{purchasedPreview ? '지금 이 바의 손님들' : '들어가기 전에 살짝 볼까요?'}</h2>{purchasedPreview ? <><p className="sheet-description">구매한 시점의 손님들이에요. 입장할 때는 달라질 수 있어요.</p><div className="preview-portraits">{purchasedPreview.guests.map(g => <div key={g.id} className={g.gender}><img src={g.photo} alt="미리보기 손님"/></div>)}</div>{rooms[previewRoom.region].find(r => r.number === previewRoom.number)?.count === CAPACITY ? <Button size="xlarge" display="block" onClick={() => requestWaitlist(previewRoom)}><Bell size={17}/>빈자리 알림 신청</Button> : <Button size="xlarge" display="block" onClick={() => requestEntry(previewRoom)}>이 바에 입장하기</Button>}</> : <><div className="locked-preview"><LockKeyhole size={29}/><span>사진은 미리보기 구매 후 공개돼요.</span></div><p className="sheet-description">{subscription ? '구독 중이면 미리보기에 포인트가 차감되지 않아요.' : '500P로 현재 손님들의 프로필 사진을 확인해요.'}<br/>미리보기에는 입장이나 자리 예약이 포함되지 않아요.</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>{subscription ? '구독 이용' : '구매 후 남는 포인트'}<strong>{subscription ? '0 P' : `${Math.max(0,wallet.balance-500).toLocaleString()} P`}</strong></span></div><Button size="xlarge" display="block" disabled={!subscription && wallet.balance < 500} onClick={buyPreview}>{subscription ? '구독으로 미리보기' : '500P로 미리보기'}</Button></>}</>}
      {sheet === 'incoming' && incoming && <><p className="eyebrow">자리 양보 요청</p><h2 id="sheet-title">자리 바꿔주실래요?</h2><p className="sheet-description">다른 손님이 지금 내 자리를 부탁했어요.<br/>{incomingSeconds}초 안에 수락하면 500P를 받아요.<br/>오늘 남은 보상 {Math.max(0,DAILY_SWAP_REWARD_LIMIT-dailySwapRewards)}회</p><div className="swap-reward"><ArrowLeftRight size={24}/><strong>+500 P</strong><span>수락과 동시에 적립</span></div><div className="actions"><Button color="dark" variant="weak" onClick={() => respondSwap(false)}>거절하기</Button><Button size="xlarge" disabled={dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT} onClick={() => respondSwap(true)}>{dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT ? '오늘 보상 한도에 도달했어요' : '양보하고 500P 받기'}</Button></div></>}
      {sheet === 'seat-request' && selectedGuest && <><p className="eyebrow">자리 양보 부탁</p><h2 id="sheet-title">자리 양보를 부탁할까요?</h2><p className="sheet-description">상대가 수락하면 500P를 보내고 서로 자리를 바꿔요.<br/>거절하거나 취소하면 포인트는 사용되지 않아요.<br/>같은 사람의 같은 자리에는 한 번만 부탁할 수 있어요.<br/>오늘 남은 요청 {Math.max(0,DAILY_SWAP_REQUEST_LIMIT-dailySwapRequests)}회</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>수락 후 남는 포인트<strong>{Math.max(0,wallet.balance-500).toLocaleString()} P</strong></span></div><Button size="xlarge" display="block" disabled={wallet.balance < 500 || !!outgoing || dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT || (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 1} onClick={sendSeatRequest}>{dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT ? '오늘 요청 한도에 도달했어요' : (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 1 ? '이미 요청했어요' : '500 포인트로 자리 양보 부탁하기'}</Button></>}
      {sheet==='shop'&&<><h2 id="sheet-title">내 포인트</h2><div className="point-balance"><Coins size={24}/><strong>{wallet.balance.toLocaleString()}<small> P</small></strong></div>
        <h3 className="section-title">포인트 모으기</h3>
        <div className="shop-list">
          <div className="shop-row"><span><strong>매일 출석</strong><small>광고 보고 하루 한 번 1,000P</small></span><Button size="small" variant="weak" disabled={wallet.attendanceDate===today || adInProgress} onClick={attendance}>{wallet.attendanceDate===today?'완료':adInProgress?'시청 중…':'광고 보기'}</Button></div>
          <div className="shop-row"><span><strong>자리 양보</strong><small>요청을 수락하고 자리를 바꾸면</small></span><b>+500P</b></div>
        </div>
        <h3 className="section-title">포인트 충전</h3><p className="shop-note">많이 충전할수록 보너스를 받아요.</p><div className="point-packs">{POINT_PACKS.map(pack=><button key={pack.points} onClick={()=>{setShopPack(pack);open('charge');}}><span>{pack.points.toLocaleString()} P {pack.bonus>0&&<em>{pack.label}</em>}</span><strong>{pack.won.toLocaleString()}원 <ArrowRight size={15}/></strong></button>)}</div>
        <h3 ref={subscriptionSection} className="section-title">정기 구독</h3><div className={`subscription-card ${subscriptionCancelAt?'is-canceling':''}`}><div><strong>{subscription?subscriptionCancelAt?'해지됨':'이용 중':`${SUBSCRIPTIONS[0].price.toLocaleString()}원`}</strong><small>{subscriptionCancelAt?`${subscriptionEndLabel()}까지 이용할 수 있어요.`:'입장·연장·미리보기 제한 없이 사용'}</small></div><Button size="small" variant="weak" onClick={requestSubscriptionChange}>{subscription?'해지 방법':'시작하기'}</Button></div><p className="shop-note">매월 자동 결제돼요. 해지는 토스 결제 내역에서 할 수 있어요.</p><h3 className="section-title">이렇게 사용해요</h3><div className="shop-list point-uses"><span>입장<strong>500P</strong></span><span>시간 연장<strong>30분 500P</strong></span><span>손님 미리보기<strong>500P</strong></span><span>자리 양보 부탁<strong>수락 시 500P</strong></span></div>
        <h3 className="section-title">최근 내역 <small className="history-limit">{historyLimit===10?'최근 10건':`${Math.min(historyLimit,ledgerCount)}건`}</small></h3><div className="point-history">{ledger.slice(0,historyLimit).map((item,index)=><div key={item.id}><span className="history-item-label"><strong>{item.label}</strong><small>{formatHistoryDate(item.date || Date.now() - index * 86400000)}</small></span><b className={item.amount>0?'earned':''}>{item.amount>0?'+':''}{item.amount.toLocaleString()} P</b></div>)}</div>{ledgerCount>10&&<div className="history-actions">{historyLimit===10?<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(Math.min(30,ledgerCount))}>전체 내역 보기</Button>:<>{historyLimit>=ledgerCount&&<p className="history-complete">모든 내역을 보고 있어요.</p>}<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(10)}>최근 10건만 보기</Button>{historyLimit<ledgerCount&&historyLimit<100&&<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(v=>Math.min(v+20,ledgerCount,100))}>더 불러오기</Button>}</>}</div>}</>}
      {sheet==='charge'&&<><h2 id="sheet-title">포인트 충전</h2><div className="point-balance"><Coins size={24}/><strong>{shopPack.points.toLocaleString()} P</strong></div><div className="order-summary"><span>상품 금액<strong>{shopPack.won.toLocaleString()}원</strong></span><span>충전 후 포인트<b>{(wallet.balance+shopPack.points).toLocaleString()} P</b></span></div><p className="sheet-description">결제 후 {shopPack.points.toLocaleString()}P가 충전돼요. 결제 수단은 토스에서 안전하게 처리돼요.</p><Button display="block" disabled={busy} onClick={buyPoints}>{busy ? '결제 진행 중…' : '결제하고 충전하기'}</Button><Button display="block" variant="weak" color="dark" onClick={()=>open('shop')}>다른 상품 보기</Button></>}
      {sheet==='subscription-confirm'&&<><p className="eyebrow">정기 구독</p><h2 id="sheet-title">정기 구독을 시작할까요?</h2><p className="sheet-description">{`매월 ${SUBSCRIPTIONS[0].price.toLocaleString()}원이 자동 결제되고, 입장·연장·미리보기를 제한 없이 이용할 수 있어요.`}</p><div className="actions"><Button color="dark" variant="weak" onClick={()=>setSheet('shop')}>취소</Button><Button size="xlarge" onClick={confirmSubscriptionChange}>구독 시작하기</Button></div></>}
      {sheet==='subscription-cancel-guide'&&<><p className="eyebrow">정기 구독</p><h2 id="sheet-title">해지는 토스에서 할 수 있어요</h2><p className="sheet-description">토스 앱 전체에서 결제 내역을 연 뒤 혼술바 정기 구독을 해지하면 돼요. 해지해도 이번 기간이 끝날 때까지는 이용할 수 있고, 다시 이어가려면 같은 결제 내역에서 자동 결제를 켜면 돼요.</p><Button size="xlarge" display="block" onClick={()=>setSheet('shop')}>확인</Button></>}
      {sheet==='notifications'&&<><h2 id="sheet-title">알림</h2>{notifications.length===0?<p className="sheet-description">새로운 알림이 없어요.</p>:<div className="notification-list">{notifications.map(item=><button key={item.id} onClick={()=>openNotification(item)}><Bell size={17}/><span><strong>{item.title}</strong><small>{item.body}</small></span><ArrowRight size={16}/></button>)}</div>}</>}
      {sheet === 'profile' && <><div className="sheet-heading-row"><div><p className="eyebrow">내 프로필</p><h2 id="sheet-title">프로필을 설정해 주세요</h2></div></div><p className="sheet-description">사진과 닉네임은 다른 손님에게 보여요.</p><input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto}/><button className="upload" onClick={() => upload.current.click()}>{profile.photo ? <img src={profile.photo} alt="선택한 내 사진"/> : <Camera size={30}/>}<span>{profile.photo ? '사진 바꾸기' : '사진 등록하기'}</span></button><p className={`photo-note${photoCheck==='ok' || profileVerified ? ' is-ok' : ''}`}>{photoCheck==='checking' ? '얼굴을 확인하고 있어요.' : photoCheck==='ok' ? '이 사진으로 진행할 수 있어요.' : profileVerified ? '확인된 사진이에요. 사진을 바꾸면 다시 확인해요.' : '본인 얼굴 사진을 사용해 주세요.'}</p><label className="profile-field"><span>닉네임</span><input value={profile.nickname} maxLength={16} aria-invalid={!!nicknameError} onChange={e=>setProfile(v=>({...v,nickname:e.target.value}))} placeholder="닉네임을 입력해 주세요"/>{nicknameError&&<small className="field-error">{nicknameError}</small>}</label><div className="gender-choice">{[['male','남성'],['female','여성']].map(([value,label]) => <button key={value} aria-pressed={profile.gender === value} className={profile.gender === value ? `selected ${value}` : ''} onClick={() => setProfile(v => ({...v,gender:value}))}>{label}{profile.gender === value && <Check size={17}/>}</button>)}</div><p className="profile-save-note">{profileVerified ? '변경한 내용을 저장해 주세요.' : '사진을 저장하려면 얼굴 확인이 필요해요.'}</p><Button size="xlarge" display="block" disabled={!profile.photo || !profile.gender || !!nicknameError || photoCheck==='checking' || (!profileVerified && photoCheck!=='ok')} onClick={() => profileVerified ? saveProfile() : setSheet('verify-profile')}>{profileVerified ? '프로필 저장하기' : '얼굴 확인하기'}</Button></>}
      {sheet === 'verify-profile' && <><p className="eyebrow">본인 얼굴 확인</p><h2 id="sheet-title">이 화면에서 촬영해 주세요</h2><p className="sheet-description">저장 전에만 확인하고, 이 촬영은 남기지 않아요.</p><div className="camera-preview"><video ref={cameraVideo} autoPlay muted playsInline webkit-playsinline="true" aria-label="본인 얼굴 촬영 화면"/><i className="camera-guide" aria-hidden="true"/><canvas ref={cameraCanvas} hidden/></div><p className={`photo-note verification-message ${verificationState==='verified'?'is-verified':''}`}>{verificationMessage}</p>{verificationState==='verified'?<Button size="xlarge" display="block" onClick={saveProfile}>프로필 저장하기</Button>:verificationState==='unavailable'?<Button size="xlarge" display="block" onClick={() => { setSheet(null); setTimeout(() => setSheet('verify-profile'), 0); }}>권한 다시 요청하기</Button>:<Button size="xlarge" display="block" disabled={verificationState!=='ready'} onClick={captureVerification}>{verificationState==='checking'?'얼굴 확인 중…':verificationState==='starting'?'카메라 준비 중…':'촬영하기'}</Button>}</>}
      {sheet === 'settings' && <><p className="eyebrow">설정</p><h2 id="sheet-title">도움이 필요하신가요?</h2><p className="sheet-description">서비스 이용과 계정을 관리할 수 있어요.</p><div className="settings-group"><span>도움말</span><div className="settings-list"><button onClick={()=>open('support')}>고객센터<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>신고·문의<ArrowRight size={16}/></button><a href="/legal/" target="_blank" rel="noopener noreferrer">약관 및 정책<ArrowRight size={16}/></a></div></div><div className="settings-group"><span>알림</span><div className="settings-list"><button onClick={openPushAgreement}>빈자리 알림 동의<ArrowRight size={16}/></button></div></div><div className="settings-group"><span>계정 및 결제</span><div className="settings-list"><button onClick={openSubscriptionManager}>결제·정기 구독 관리<ArrowRight size={16}/></button><button onClick={()=>open('withdraw')} className="danger-link">회원탈퇴<ArrowRight size={16}/></button></div></div></>}
      {sheet === 'region-request' && <><p className="eyebrow">지역 추가 요청</p><h2 id="sheet-title">어디에서 만나고 싶나요?</h2><p className="sheet-description">원하는 지역을 골라 주세요.</p>{REGION_REQUEST_GROUPS.map(group=><div className="region-request-section" key={group.title}><span>{group.title}</span><div className="region-request-grid">{group.options.map(item=><button key={item} className={requestedRegion===item?'selected':''} onClick={()=>{setRequestedRegion(item);setShowCustomRegion(false);}}>{item}</button>)}{group.title==='주요 도시'&&<button style={{borderStyle:'dashed',borderWidth:'1.5px',borderColor:'#b7c0cb'}} className={`custom-region-toggle ${showCustomRegion?'selected':''}`} onClick={()=>{setShowCustomRegion(v=>!v);setRequestedRegion('');}}>직접 입력</button>}</div></div>)}{showCustomRegion&&<input className="custom-region-input" value={customRegion} onChange={e=>setCustomRegion(e.target.value)} placeholder="지역명을 입력해 주세요" maxLength={20}/>}<Button display="block" disabled={!requestedRegion && !(showCustomRegion&&customRegion.trim())} onClick={submitRegion}>이 지역 추가 요청하기</Button><p className="digital-note">요청 건수와 우선순위에 따라 지역을 추가해요.</p></>}
      {sheet === 'support' && <><p className="eyebrow">고객센터</p><h2 id="sheet-title">무엇을 도와드릴까요?</h2><p className="sheet-description">혼술바 이용 중 궁금한 점을 확인하거나 문의를 남겨 주세요.</p><div className="settings-list"><button onClick={()=>{setOpenFaq(null);open('faq')}}>자주 묻는 질문<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>문의 남기기<ArrowRight size={16}/></button></div></>}
      {sheet === 'faq' && <><p className="eyebrow">자주 묻는 질문</p><h2 id="sheet-title">혼술바 이용 안내</h2><p className="sheet-description">자주 궁금해하는 내용을 모아봤어요.</p><div className="faq-list">{FAQ_ITEMS.map(([question,answer],index)=><div className={`faq-item ${openFaq===index?'open':''}`} key={question}><button onClick={()=>setOpenFaq(openFaq===index?null:index)}><span>{question}</span>{openFaq===index?<ChevronDown size={17}/>:<ArrowRight size={17}/>}</button>{openFaq===index&&<p>{answer}</p>}</div>)}</div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>답을 찾지 못했어요 · 문의하기</Button></>}
      {sheet === 'inquiry' && <><p className="eyebrow">신고·문의</p><h2 id="sheet-title">문의 내용을 남겨 주세요</h2><p className="sheet-description">확인 후 운영팀이 순서대로 답변드릴게요.</p><div className="form-choice">{['결제·구독 문의','이용 방법 문의','서비스 신고','기타 문의'].map(item=><button key={item} className={inquiryType===item?'selected':''} onClick={()=>setInquiryType(item)}>{item}</button>)}</div><textarea className="support-textarea" value={inquiryMessage} onChange={e=>setInquiryMessage(e.target.value)} placeholder={inquiryType==='서비스 신고'?'신고할 내용을 자세히 입력해 주세요.':'문의 내용을 입력해 주세요.'} maxLength={500}/><div className="form-footer"><span>{inquiryMessage.length}/500</span><Button size="large" disabled={!inquiryMessage.trim()} onClick={submitInquiry}>{inquiryType==='서비스 신고'?'신고 접수하기':'문의 접수하기'}</Button></div></>}
      {sheet === 'inquiry-detail' && selectedInquiry && <><p className="eyebrow">문의 답변</p><h2 id="sheet-title">운영팀 답변</h2><div className="inquiry-message"><small>{selectedInquiry.type}</small><p>{selectedInquiry.message}</p></div><div className="inquiry-answer"><strong>운영팀</strong><p>{selectedInquiry.answer || '문의 내용을 확인하고 있어요. 답변이 등록되면 알림으로 알려드릴게요.'}</p></div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>문의 남기기</Button></>}
      {sheet === 'withdraw' && <><p className="eyebrow">회원탈퇴</p><h2 id="sheet-title">정말 탈퇴할까요?</h2><p className="sheet-description">프로필과 이용 기록이 삭제되고, 진행 중인 정기 구독은 먼저 해지해야 해요.<br/>삭제된 정보는 복구할 수 없어요.</p><div className="actions"><Button color="dark" variant="weak" onClick={openProfileEditor}>취소</Button><Button size="xlarge" disabled={busy} onClick={withdraw}>탈퇴하기</Button></div></>}
      {sheet === 'move' && <><h2 id="sheet-title">옆자리 분께 인사하고 갈까요?</h2><p className="sheet-description">가볍게 인사를 건네고 자리를 옮겨요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>머무르기</Button><Button size="xlarge" onClick={() => commitMove(pendingSeat)}>자리 옮기기</Button></div></>}
      {sheet === 'guest' && selectedGuest && <><div className="guest-photo"><img src={selectedGuest.photo} alt="선택한 손님"/><Glass id={selectedGuest.drinkId}/></div><h2 id="sheet-title">{selectedGuest.nickname || '혼술 친구'}</h2><p className="guest-meta"><span>{DRINKS.find(d => d.id === selectedGuest.drinkId)?.name} 마시는 중</span><span aria-hidden="true">·</span><span>{partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?'옆자리와 대화 중':mutedGuests.includes(selectedGuest.id)?(reportedIds.has(selectedGuest.id)?'신고로 들리지 않아요':'음소거되어 들리지 않아요'):selectedGuest.mic===false?'마이크가 꺼져 있어요':`내 자리에서 ${Math.round(audioGain({id:'me',seat},selectedGuest,facing,partners,mutedGuests)*100)}%로 들려요`}</span></p>
        {partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?<div className="guest-focus-panel"><MessageCircleMore size={18}/><p>지금 1:1로 대화하고 있어요.<br/>다른 사람에게는 목소리가 들리지 않아요.</p><Button size="large" variant="weak" disabled={waveSent.includes(selectedGuest.id)} onClick={()=>sendWave(selectedGuest)}>{waveSent.includes(selectedGuest.id)?'인사를 남겼어요':'손 흔들기'}</Button></div>:activeFocus===selectedGuest.id?<Button display="block" variant="weak" onClick={()=>{endFocus();setSheet(null);}}>전체 대화로 돌아가기</Button>:<div className="guest-focus-panel"><Button size="large" display="block" disabled={!adjacent(seat,selectedGuest.seat)||!!activeFocus||!!focusRequest||mutedGuests.includes(selectedGuest.id)||seconds===0} onClick={()=>requestFocus(selectedGuest)}>이 옆자리와만 대화하기</Button><p>{!adjacent(seat,selectedGuest.seat)?'바로 옆에 앉아 있을 때 이용할 수 있어요.':'상대가 수락하면 서로의 목소리만 들려요. 자리를 옮기면 전체 대화로 돌아가요.'}</p></div>}
        <Button className="guest-seat-request" size="large" variant="weak" color="dark" display="block" disabled={!!outgoing || wallet.balance < 500} onClick={() => open('seat-request')}><ArrowLeftRight size={17}/>이 자리 부탁하기 · 500P</Button><p className="footnote">상대가 수락하면 서로 자리를 바꿔요.</p><div className="guest-actions"><button onClick={() => {if(reportedIds.has(selectedGuest.id)) return; if(activeFocus===selectedGuest.id) endFocus();setMutedGuests(v => v.includes(selectedGuest.id) ? v.filter(id => id !== selectedGuest.id) : [...v,selectedGuest.id]);setSheet(null);}}><VolumeX size={15}/>{reportedIds.has(selectedGuest.id) ? '신고로 음소거됨' : mutedGuests.includes(selectedGuest.id) ? '음소거 해제' : selectedGuest.seat===11 ? '사장 음소거' : '음소거'}</button><button onClick={() => open('report')}><Flag size={15}/>신고</button></div></>}
      {sheet === 'report' && <><p className="eyebrow">신고하기</p><h2 id="sheet-title">어떤 일이 있었나요?</h2><p className="sheet-description">신고 내용은 운영팀이 확인하고 필요한 조치를 진행해요.</p><div className="form-choice report-choice">{['사진 도용·허위 프로필','욕설·불쾌한 발언','광고·금전 요구','기타'].map(reason=><button key={reason} className={reportReason===reason?'selected':''} onClick={()=>setReportReason(reason)}>{reason}</button>)}</div><textarea className="support-textarea" value={reportMessage} onChange={e=>setReportMessage(e.target.value)} placeholder="상황을 자세히 알려 주세요. (선택)" maxLength={500}/><div className="form-footer"><span>{reportMessage.length}/500</span><Button size="large" disabled={!reportReason || busy} onClick={submitReport}>신고 접수하기</Button></div></>}
      {sheet === 'reported-entry' && pendingEntry && <><p className="eyebrow">입장 전 안내</p><h2 id="sheet-title">이전에 신고한 손님이 있어요</h2><p className="sheet-description">{pendingEntry.region} {pendingEntry.number}호점에 전에 신고한 손님이 있어요.<br/>들어가도 그 손님의 목소리는 들리지 않아요. 그래도 입장할까요?</p><div className="actions"><Button color="dark" variant="weak" onClick={() => { setPendingEntry(null); setSheet(null); setToast('다른 호점을 골라 주세요.'); }}>다른 바 보기</Button><Button size="xlarge" onClick={() => requestEntry(pendingEntry, { ignoreReport: true })}>그래도 입장하기</Button></div></>}
      {sheet === 'leave' && <><DoorOpen size={28}/><h2 id="sheet-title">오늘은 여기까지 할까요?</h2><p className="sheet-description">바를 나가면 이번 방문의 이용이 끝나요.<br/>다음 호점은 새로 입장해 주세요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>더 머무르기</Button><Button size="xlarge" onClick={leave}>바 나가기</Button></div></>}
      {error && <p className="error" role="alert">{error}</p>}
    </div></BottomSheet>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('admin') ? <AdminPage/> : <App/>);
