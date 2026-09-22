import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, BottomSheet, Badge } from './ui';
import { ArrowLeft, ArrowRight, Bell, Camera, Check, ChevronDown, Clock3, DoorOpen, Coins, Headphones, MessageCircleMore, Mic, MicOff, Plus, Volume2, VolumeX, Speaker, Wine, X, Flag, Wallet, Eye, LockKeyhole, ArrowLeftRight, Settings } from 'lucide-react';
import { REGIONS, CAPACITY, DRINKS, initialWallet, remaining, purchase, changeRole, addArrival, transferPoints } from './model';
import { guestsFor, localProfile, conversation } from './fixtures';
import { useVoice } from './useVoice';
import { Glass } from './Glass';
import { SEATS as positions, POINT_PACKS, SUBSCRIPTIONS, adjacent, audioGain, validPartners, claimAttendance } from './social';
import './style.css';

function Waves() { return <span className="waves" aria-hidden="true"><i/><i/><i/><i/></span>; }
const FAQ_ITEMS = [
  ['입장하면 포인트가 얼마 차감되나요?', '첫 입장은 선택한 음료에 따라 차감돼요. 기본 음료는 500P로 30분 이용할 수 있고, 입장 후 한 잔 더 주문해 시간을 연장할 수 있어요.'],
  ['바를 나가면 남은 시간이 어떻게 되나요?', '한 호점에서만 이용 시간이 흐르고, 바를 나가면 이번 방문이 끝나요. 남은 시간은 다른 호점으로 이어지지 않아요.'],
  ['입장 전에 손님 사진을 볼 수 있나요?', '미리보기 상품을 구매하면 현재 호점에 있는 손님들의 사진을 확인할 수 있어요. 미리보기는 입장이나 자리 예약을 포함하지 않아요.'],
  ['목소리가 불편한 손님은 어떻게 신고하나요?', '손님 프로필에서 신고를 선택하고 사유와 내용을 접수해 주세요. 신고한 손님의 목소리는 바로 음소거되고 운영팀이 내용을 확인해요.'],
  ['정기 구독은 언제든 해지할 수 있나요?', '설정의 결제·정기 구독 관리에서 해지할 수 있어요. 해지하면 다음 결제일부터 자동 결제가 멈춰요.'],
];
const REGION_REQUEST_GROUPS = [
  {title:'광역시·특별자치도', options:['광주','울산','세종','제주']},
  {title:'경기 도시', options:['고양','구리','군포','김포','부천','성남','수원','시흥','안산','안양','용인','의정부']},
  {title:'주요 도시', options:['강릉','김해','목포','양산','여수','원주','익산','전주','진주','창원','천안','청주','춘천','포항']},
];
const DAILY_SWAP_REWARD_LIMIT = 3;
const DAILY_SWAP_REQUEST_LIMIT = 5;
function todayKey() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()); }
function initialScreen() {
  try { return localStorage.getItem('honsulbar:onboarding:v1') === 'done' ? 'lobby' : 'onboarding'; } catch { return 'onboarding'; }
}
function App() {
  const [screen, setScreen] = useState(initialScreen);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [shopPack, setShopPack] = useState(POINT_PACKS[0]);
  const [ledger, setLedger] = useState([
    {id:'opening',label:'포인트 잔액',amount:1000},
    {id:'sample-1',label:'출석 포인트',amount:1000},
    {id:'sample-2',label:'하우스 하이볼 주문',amount:-500},
    {id:'sample-3',label:'자리 양보 보상',amount:500},
    {id:'sample-4',label:'손님 미리보기',amount:-500},
    {id:'sample-5',label:'포인트 충전',amount:3300},
    {id:'sample-6',label:'레드 와인 주문',amount:-500},
    {id:'sample-7',label:'출석 포인트',amount:1000},
    {id:'sample-8',label:'자리 양보 요청',amount:-500},
    {id:'sample-9',label:'포인트 충전',amount:1100},
    {id:'sample-10',label:'진토닉 주문',amount:-500},
    {id:'sample-11',label:'자리 양보 보상',amount:500},
  ]);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [enteredAt, setEnteredAt] = useState(Date.now());
  const [facing, setFacing] = useState(0);
  const [audioFacing, setAudioFacing] = useState(0);
  const [focusRequest, setFocusRequest] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [waveSent, setWaveSent] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [subscription, setSubscription] = useState(false);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState(null);
  const [subscriptionCancelAt, setSubscriptionCancelAt] = useState(null);
  const [focusSubscription, setFocusSubscription] = useState(false);
  const [region, setRegion] = useState('서울');
  const [rooms, setRooms] = useState(() => Object.fromEntries(REGIONS.map((r, i) => [r, [{ number: 1, count: 12 }, { number: 2, count: i === 0 ? 8 : 5 + i }]])));
  const [room, setRoom] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [previewRoom, setPreviewRoom] = useState(null);
  const [previews, setPreviews] = useState({});
  const [guestOverrides, setGuestOverrides] = useState({});
  const [guestBalances, setGuestBalances] = useState({});
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [seatRequestCounts, setSeatRequestCounts] = useState({});
  const [swapRewards, setSwapRewards] = useState({date:todayKey(), count:0});
  const [swapRequests, setSwapRequests] = useState({date:todayKey(), count:0});
  const [swapRewardPairs, setSwapRewardPairs] = useState({});
  const offeredRooms = useRef(new Set());
  const settledRequests = useRef(new Set());
  const previewLock = useRef(false);
  const latest = useRef(null);
  const [profile, setProfile] = useState(localProfile);
  const [profileVerified, setProfileVerified] = useState(false);
  const [verificationState, setVerificationState] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [seat, setSeat] = useState(3);
  const [wallet, setWallet] = useState(initialWallet);
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState('highball');
  const [speaker, setSpeaker] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [turn, setTurn] = useState(0);
  const [speakingGuest, setSpeakingGuest] = useState(null);
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
  const [inquiries, setInquiries] = useState([]);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [requestedRegion, setRequestedRegion] = useState('');
  const [customRegion, setCustomRegion] = useState('');
  const [showCustomRegion, setShowCustomRegion] = useState(false);
  const [newRoom, setNewRoom] = useState(null);
  const upload = useRef(null);
  const cameraVideo = useRef(null);
  const cameraCanvas = useRef(null);
  const cameraStream = useRef(null);
  const subscriptionSection = useRef(null);
  const cueContext = useRef(null);
  const orderLock = useRef(false);
  const guests = useMemo(() => guestsFor(room?.count || 0).map(g => ({ ...g, seat: guestOverrides[g.id] ?? g.seat })), [room?.count, guestOverrides]);
  const people = [{id:'me',seat},...guests];
  const partners = validPartners(people,[...(focusId ? [['me',focusId]] : []),['guest-0','guest-1']]);
  const activeFocus = partners.me;
  const neighbors = guests.filter(g=>adjacent(seat,g.seat));
  const guest = guests[turn % Math.max(1, guests.length)];
  const voice = useVoice(screen === 'bar', setToast);
  const seconds = remaining(wallet, now);
  const incomingSeconds = incoming ? Math.max(0, Math.ceil((incoming.expiresAt - now) / 1000)) : 0;
  const currentDrink = DRINKS.find(d => d.id === wallet.drinkId);
  const chosen = DRINKS.find(d => d.id === selection);
  const isWelcome = sheet === 'welcome';
  const price = isWelcome ? 500 : chosen.price;
  latest.current = { wallet, seat, guests, guestBalances, partners, screen };
  const previewKey = previewRoom ? `${previewRoom.region}:${previewRoom.number}` : null;
  const purchasedPreview = previews[previewKey];
  const dailySwapRewards = swapRewards.date === todayKey() ? swapRewards.count : 0;
  const dailySwapRequests = swapRequests.date === todayKey() ? swapRequests.count : 0;

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
  useEffect(() => {
    if (!focusRequest) return;
    const timer=setTimeout(()=>{
      const current=latest.current;
      const target=current.guests.find(g=>g.id===focusRequest.id);
      if (current.screen!=='bar' || remaining(current.wallet,Date.now())===0 || !target || !adjacent(current.seat,target.seat) || current.partners[target.id] || mutedGuests.includes(target.id)) {
        setToast('지금은 대화를 시작하기 어려워요. 잠시 뒤 다시 인사해 주세요.');
      } else { setFocusId(target.id);setToast('옆자리와 대화를 시작했어요. 언제든 전체 대화로 돌아갈 수 있어요.'); }
      setFocusRequest(null);
    },2500);
    return ()=>clearTimeout(timer);
  },[focusRequest,mutedGuests]);
  useEffect(() => { if(focusId && !activeFocus) {setFocusId(null);setToast('자리가 바뀌어 전체 대화로 돌아왔어요.');} },[focusId,activeFocus]);

  useEffect(() => {
    if (screen !== 'bar' || !guests.length || seat === 11) return;
    if (dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT) return;
    const key = `${room.region}:${room.number}`;
    if (offeredRooms.current.has(key)) return;
    const timer = setTimeout(() => {
      const target = latest.current.guests.find(g => g.seat !== 11 && Math.abs(g.seat - latest.current.seat) > 1);
      if (!target) return;
      offeredRooms.current.add(key);
      setIncoming({ id: `incoming-${key}`, guestId: target.id, selfSeat: latest.current.seat, guestSeat: target.seat, direction: 'receive', expiresAt: Date.now() + 60000 });
      playCue('request');
    }, 18000);
    return () => clearTimeout(timer);
  }, [screen, room?.region, room?.number, guests.length, seat, dailySwapRewards]);
  useEffect(() => {
    if (!outgoing) return;
    const timer = setTimeout(() => settleSwap(outgoing), 3000);
    return () => clearTimeout(timer);
  }, [outgoing]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (incoming && incomingSeconds === 0) { setIncoming(null); if (sheet === 'incoming') setSheet(null); } }, [incoming, incomingSeconds, sheet]);
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
  useEffect(() => () => { if (profile.photo?.startsWith('blob:')) URL.revokeObjectURL(profile.photo); }, [profile.photo]);
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
      setVerificationMessage('이 환경에서는 카메라를 사용할 수 없어요. 사진 확인을 건너뛰고 운영팀 확인으로 등록할 수 있어요.');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      cameraStream.current = stream;
      if (cameraVideo.current) { cameraVideo.current.srcObject = stream; cameraVideo.current.play().catch(() => {}); }
      setVerificationState('ready');
      setVerificationMessage('얼굴이 화면 안에 보이도록 맞춰 주세요.');
    }).catch(() => {
      setVerificationState('unavailable');
      setVerificationMessage('카메라 권한이 필요해요. 권한을 허용하거나 사진 확인을 건너뛸 수 있어요.');
    });
    return () => { cancelled = true; };
  }, [sheet]);
  useEffect(() => {
    if (screen !== 'lobby' || sheet) return;
    const timer = setInterval(() => {
      setRooms(previous => ({ ...previous, [region]: addArrival(previous[region]) }));
    }, 9000);
    return () => clearInterval(timer);
  }, [screen, sheet, region]);
  const previousRoomCount = useRef({ region, count: rooms[region].length });
  useEffect(() => {
    const previous = previousRoomCount.current;
    if (previous.region === region && rooms[region].length > previous.count) setNewRoom(rooms[region].at(-1).number);
    previousRoomCount.current = { region, count: rooms[region].length };
  }, [rooms, region]);
  useEffect(() => {
    if (screen !== 'bar') return;
    const timer = setInterval(() => setTurn(v => v + 1), 5800);
    return () => clearInterval(timer);
  }, [screen]);
  useEffect(() => {
    if (screen !== 'bar' || !guest) { setSpeakingGuest(null); return; }
    // Visual conversation continues when listening is muted, like a real room.
    setSpeakingGuest(guest.id);
    const timer = setTimeout(() => setSpeakingGuest(null), 4000);
    return () => clearTimeout(timer);
  }, [screen, guest?.id, turn]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (screen !== 'bar' || !soundOn || !guest || mutedGuests.includes(guest.id)) return;
    const volume = audioGain({id:'me',seat},guest,audioFacing,partners,mutedGuests);
    if (!volume) return;
    const utterance = new SpeechSynthesisUtterance(conversation[turn % conversation.length]);
    utterance.lang = 'ko-KR'; utterance.rate = .94; utterance.pitch = guest.gender === 'female' ? 1.1 : .86; utterance.volume = volume;
    const korean = synth.getVoices().find(v => v.lang.startsWith('ko'));
    if (korean) utterance.voice = korean;
    utterance.onstart = () => setSpeakingGuest(guest.id);
    utterance.onend = () => setSpeakingGuest(null);
    synth.speak(utterance);
    return () => synth.cancel();
  }, [screen, soundOn, turn, seat, guest?.id, mutedGuests, audioFacing, activeFocus, JSON.stringify(partners)]);
  useEffect(() => {
    if (screen === 'bar' && seconds === 0 && seat !== 11 && wallet.welcomed) {
      voice.stop(); setSpeaker(false);setFocusId(null);setFocusRequest(null);
    }
  }, [seconds, screen, seat, wallet.welcomed, voice.stop]);

  function recordPoints(label,amount) { setLedger(v=>[{id:crypto.randomUUID(),label,amount,date:Date.now()},...v]); }
  function formatHistoryDate(timestamp) { return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric'}).format(new Date(timestamp)); }
  function submitInquiry() {
    const id = crypto.randomUUID();
    const inquiry = { id, type: inquiryType, message: inquiryMessage.trim(), createdAt: Date.now(), answer: null };
    setInquiries(v => [inquiry, ...v]);
    setSheet(null); setInquiryMessage(''); setToast('문의가 접수됐어요. 답변이 오면 알려드릴게요.');
    setTimeout(() => {
      const answer = '문의해 주신 내용을 확인했어요. 이용에 불편이 없도록 안내를 반영할게요.';
      setInquiries(v => v.map(item => item.id === id ? {...item, answer, answeredAt: Date.now()} : item));
      setNotifications(v => [{ id: `inquiry-${id}`, type:'inquiry', inquiryId:id, title:'문의 답변이 도착했어요', body:'운영팀이 문의에 답변을 남겼어요.', unread:true }, ...v]);
      setToast('문의 답변이 도착했어요.');
    }, 5000);
  }
  function resetConversation() {setFocusId(null);setFocusRequest(null);setFacing(0);setAudioFacing(0);}
  function requestFocus(target) {
    if (!target || !adjacent(seat,target.seat) || partners[target.id] || mutedGuests.includes(target.id) || seconds===0 || focusRequest || activeFocus) return;
    setFocusRequest({id:target.id});setSheet(null);setToast('옆자리와 대화를 요청했어요. 수락하면 시작해요.');
  }
  function requestWaitlist(target) {
    const targetRegion = target.region || region;
    const key = `${targetRegion}:${target.number}`;
    if (waitlist.includes(key)) { setToast('빈자리가 생기면 알려드릴게요.'); return; }
    setWaitlist(v => [...v, key]);
    if (sheet === 'preview') setSheet(null);
    setToast('빈자리가 생기면 알려드릴게요.');
    setTimeout(() => {
      setRooms(previous => ({ ...previous, [targetRegion]: previous[targetRegion].map(room => room.number === target.number ? { ...room, count: Math.max(0, room.count - 1) } : room) }));
      setNotifications(v => [{ id: `available-${key}-${Date.now()}`, region: targetRegion, number: target.number, title: `${targetRegion} ${target.number}호점`, body: '빈자리가 생겼어요. 지금 입장할 수 있어요.', unread: true }, ...v]);
      playCue('notification');
      setToast(`${targetRegion} ${target.number}호점에 빈자리가 생겼어요.`);
    }, 5000);
  }
  function attendance() {
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
    if(latest.current.wallet.attendanceDate===day) return;
    const next=claimAttendance(latest.current.wallet,day);
    latest.current.wallet=next;setWallet(next);recordPoints('출석 포인트',1000);setToast('출석 포인트 1,000P를 받았어요.');
  }
  function requestPreview(target) {
    setPreviewRoom({ ...target, region }); previewLock.current = false; open('preview');
  }
  function buyPreview() {
    if (previewLock.current || previews[previewKey]) return;
    const current = rooms[previewRoom.region].find(r => r.number === previewRoom.number);
    if (!current?.count) { setError('아직 손님이 없어요. 포인트는 사용되지 않았어요.'); return; }
    if (wallet.balance < 500) { setError('500P가 필요해요. 자리 양보로 포인트를 받을 수 있어요.'); return; }
    previewLock.current = true;
    setWallet(v => ({ ...v, balance: v.balance - 500 }));recordPoints('손님 미리보기',-500);
    setPreviews(v => ({ ...v, [previewKey]: { guests: guestsFor(current.count), at: Date.now() } }));
    setToast('500P 사용 · 지금 머무는 손님을 확인해요');
  }
  function settleSwap(request) {
    if (settledRequests.current.has(request.id)) return;
    const current = latest.current;
    const target = current.guests.find(g => g.id === request.guestId);
    if (!target || current.seat !== request.selfSeat || target.seat !== request.guestSeat) {
      setIncoming(null); setOutgoing(null); setToast('자리가 바뀌어 요청이 취소됐어요. 포인트는 사용되지 않았어요.'); return;
    }
    const day = todayKey();
    const rewardsToday = swapRewards.date === day ? swapRewards.count : 0;
    const rewardPairKey = `${day}:${target.id}`;
    if (request.direction === 'receive' && rewardsToday >= DAILY_SWAP_REWARD_LIMIT) {
      setIncoming(null); setOutgoing(null); setSheet(null); setToast('오늘 받을 수 있는 자리 양보 보상을 모두 받았어요.'); return;
    }
    if (request.direction === 'receive' && swapRewardPairs[rewardPairKey]) {
      setIncoming(null); setOutgoing(null); setSheet(null); setToast('같은 손님에게서는 오늘 한 번만 보상을 받을 수 있어요.'); return;
    }
    const guestBalance = current.guestBalances[target.id] ?? 2000;
    try {
      const paid = request.direction === 'receive'
        ? transferPoints(guestBalance, current.wallet.balance, 500)
        : transferPoints(current.wallet.balance, guestBalance, 500);
      settledRequests.current.add(request.id);
      const ownBalance = request.direction === 'receive' ? paid.receiver : paid.payer;
      const otherBalance = request.direction === 'receive' ? paid.payer : paid.receiver;
      setWallet(changeRole({ ...current.wallet, balance: ownBalance }, target.seat === 11, Date.now()));
      setGuestBalances(v => ({ ...v, [target.id]: otherBalance }));
      setGuestOverrides(v => ({ ...v, [target.id]: current.seat }));
      resetConversation();recordPoints(request.direction==='receive'?'자리 양보 보상':'자리 양보 요청',request.direction==='receive'?500:-500);
      if (request.direction === 'receive') {
        setSwapRewards({date:day, count:rewardsToday + 1});
        setSwapRewardPairs(v => ({ ...v, [rewardPairKey]: true }));
      }
      setSeat(target.seat); setIncoming(null); setOutgoing(null); setSheet(null); setNow(Date.now());
      setToast(request.direction === 'receive' ? '자리를 양보하고 500P를 받았어요' : '요청을 수락했어요. 500P를 보내고 자리를 바꿨어요');
    } catch (e) { setIncoming(null); setOutgoing(null); setError(e.message); setToast(e.message); }
  }
  function sendSeatRequest() {
    if (outgoing || !selectedGuest || wallet.balance < 500) return;
    if (dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT) { setToast('오늘은 자리 양보 요청을 더 보낼 수 없어요.'); return; }
    const requestKey = `${selectedGuest.id}:${selectedGuest.seat}`;
    if ((seatRequestCounts[requestKey] || 0) >= 2) { setToast('같은 자리에는 두 번까지만 부탁할 수 있어요.'); return; }
    setSeatRequestCounts(v => ({ ...v, [requestKey]: (v[requestKey] || 0) + 1 }));
    setSwapRequests({date:todayKey(), count:dailySwapRequests + 1});
    setOutgoing({ id: `outgoing-${Date.now()}`, guestId: selectedGuest.id, selfSeat: seat, guestSeat: selectedGuest.seat, direction: 'send' });
    setIncoming(null); setSheet(null); setToast('자리 양보를 부탁했어요. 수락하면 500P가 사용돼요.');
  }
  function open(value) { setError(''); orderLock.current = false; setSheet(value); }
  function openSubscriptionManager() { setFocusSubscription(true); open('shop'); }
  function requestSubscriptionChange() { open('subscription-confirm'); }
  function confirmSubscriptionChange() {
    if (!subscription) {
      setSubscription(true);
      setSubscriptionPeriodEnd(Date.now() + 30 * 24 * 60 * 60 * 1000);
      setSubscriptionCancelAt(null);
      setSheet('shop');
      setToast('정기 구독을 시작했어요.');
      return;
    }
    if (subscriptionCancelAt) {
      setSubscriptionCancelAt(null);
      setSheet('shop');
      setToast('정기 구독 자동 결제를 다시 유지해요.');
      return;
    }
    setSubscriptionCancelAt(subscriptionPeriodEnd || Date.now() + 30 * 24 * 60 * 60 * 1000);
    setSheet('shop');
    setToast('구독을 해지 예약했어요. 이용 기간 마지막 날까지 사용할 수 있어요.');
  }
  function subscriptionEndLabel() { return subscriptionPeriodEnd ? new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric'}).format(new Date(subscriptionPeriodEnd)) : ''; }
  function requestEntry(target) {
    if (!target) return;
    target = rooms[region].find(r => r.number === target.number) || target;
    if (target.count >= CAPACITY) return;
    setRoom({ ...target, region }); setGuestOverrides({}); setGuestBalances({});
    if (!profile.photo || !profile.gender) { open('profile'); return; }
    if (remaining(wallet, Date.now()) === 0) { setSelection('highball'); open('welcome'); }
    else enterRoom(target);
  }
  function enterRoom(target = room) {
    if (!target || target.count >= CAPACITY) { setSheet(null); setToast('자리가 모두 찼어요. 다른 호점을 골라주세요.'); return; }
    const taken = guestsFor(target.count).map(g => g.seat);
    setSeat(positions.findIndex((_, i) => !taken.includes(i)));
    setEnteredAt(Date.now());resetConversation();setWaveSent([]);
    setScreen('bar'); setSheet(null); setTurn(0); setSpeaker(false);
    const count = remaining(wallet, Date.now());
    if (wallet.expiresAt === null && wallet.welcomed && count > 0) setWallet(v => changeRole(v, false, Date.now()));
  }
  function confirmOrder() {
    if (orderLock.current) return;
    try {
      const next = purchase(wallet, selection, Date.now(), { welcome: isWelcome, host: screen === 'bar' && seat === 11 });
      orderLock.current = true; if(!isWelcome) recordPoints(chosen.name+' 주문',-price); setWallet(next); setNow(Date.now());
      if (screen === 'lobby') {
        const taken = guestsFor(room.count).map(g => g.seat);
        const freeSeat = positions.findIndex((_, i) => !taken.includes(i));
        setEnteredAt(Date.now());resetConversation();setWaveSent([]);
        setSeat(freeSeat); setScreen('bar'); setTurn(0); setSpeaker(false);
        if (freeSeat === 11) setWallet(changeRole(next, true, Date.now()));
      }
      setSheet(null); setError('');
      setToast(isWelcome ? `${chosen.name}, ${price.toLocaleString()} 포인트로 ${chosen.minutes}분 이용을 시작했어요.` : `${price.toLocaleString()} 포인트 사용 · ${chosen.minutes}분 연장했어요`);
    } catch (e) { setError(e.message); }
  }
  function choosePhoto(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하의 JPG, PNG, WebP 사진을 골라주세요.'); return; }
    setProfile(v => ({ ...v, photo: URL.createObjectURL(file) })); setError('');
  }
  function commitMove(index) {
    resetConversation();
    setIncoming(null); setOutgoing(null);
    setWallet(v => changeRole(v, index === 11, Date.now())); setNow(Date.now()); setSeat(index); setSheet(null);
    setToast(index === 11 ? '사장 자리에 앉았어요. 모두의 목소리를 들을 수 있어요.' : '자리를 옮겼어요');
  }
  function requestMove(index) {
    if (seconds === 0 && index !== 11) { open('menu'); return; }
    if (seat !== 11 && guests.some(g => g.seat !== 11 && Math.abs(g.seat - seat) === 1)) {
      setPendingSeat(index); open('move');
    } else commitMove(index);
  }
  function leave() {
    resetConversation();
    voice.stop(); setSpeaker(false); setSoundOn(true); setIncoming(null); setOutgoing(null); window.speechSynthesis?.cancel();
    setWallet(v => ({ ...v, expiresAt: null, heldSeconds: 0, drinkId: null }));
    setScreen('lobby'); setSheet(null); setRoom(null);
  }
  function toggleSpeaker() {
    if (seconds === 0 && seat !== 11) { open('menu'); return; }
    const next = !speaker;
    if (next && !voice.mic) voice.toggle();
    setSpeaker(next);
  }
  const time = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  const localRooms = rooms[region];
  const recommended = localRooms.filter(r => r.count < CAPACITY).sort((a,b) => Math.abs(a.count - 7) - Math.abs(b.count - 7))[0];
  const guestsTalking = guest && speakingGuest === guest.id;
  const audible = guest && audioGain({id:'me',seat},guest,facing,partners,mutedGuests) > 0;
  const selected = selectedRoom?.region === region ? localRooms.find(r=>r.number===selectedRoom.number) : null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(now));
  const guestSeconds = person => Math.max(0,person.seconds-Math.floor((now-enteredAt)/1000));

  function completeOnboarding() {
    setProfile(v => ({ ...v, photo: null }));
    setProfileVerified(false);
    try { localStorage.setItem('honsulbar:onboarding:v1', 'done'); } catch {}
    setScreen('lobby');
    setSheet('profile');
  }

  function verifyProfilePhoto() {
    setProfileVerified(true);
    setVerificationState('verified');
    setVerificationMessage('사진에서 얼굴을 확인했어요. 촬영본은 저장하지 않고 바로 삭제했어요.');
  }

  async function captureVerification() {
    const video = cameraVideo.current;
    const canvas = cameraCanvas.current;
    if (!video || !canvas || video.readyState < 2) { setVerificationMessage('카메라가 준비될 때까지 잠시만 기다려 주세요.'); return; }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    let hasFace = true;
    if ('FaceDetector' in window) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
        hasFace = (await detector.detect(canvas)).length > 0;
        if (hasFace && profile.photo) {
          const image = new Image(); image.src = profile.photo; await image.decode();
          hasFace = (await detector.detect(image)).length > 0;
        }
      } catch {}
    }
    if (!hasFace) { setVerificationState('ready'); setVerificationMessage('얼굴을 찾지 못했어요. 화면을 바라보고 다시 촬영해 주세요.'); return; }
    verifyProfilePhoto();
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
      <Button size="xlarge" display="block" onClick={completeOnboarding}>프로필 등록하고 시작하기</Button>
    </div>
  </main>;

  return <main className="app">
    <header>
      {screen === 'bar' ? <button className="icon-button" aria-label="바 나가기" onClick={()=>open('leave')}><ArrowLeft size={21}/></button> : <button className="point-entry" aria-label={`포인트 상점, ${wallet.balance.toLocaleString()}P`} onClick={()=>open('shop')}><Coins size={17}/><span>{wallet.balance.toLocaleString()}<small> P</small></span></button>}
      <div className="header-actions"><button className="header-icon-button" aria-label="설정" onClick={()=>open('settings')}><Settings size={18}/></button><button className="notification-button" aria-label={`알림 ${notifications.length}개`} onClick={()=>{setNotifications(v=>v.map(item=>({...item,unread:false})));open('notifications')}}><Bell size={18}/>{notifications.some(item=>item.unread)&&<i/>}</button><button className="profile-button" aria-label="내 프로필" onClick={()=>{if(screen==='lobby') setRoom(null);open('profile');}}><img src={profile.photo} alt="내 프로필"/></button></div>
    </header>
    {screen === 'lobby' ? <section className="lobby">
      <div className="lobby-heading"><h1>오늘은 어디서 마실까요?</h1></div>
      <div className="regions" aria-label="지역">{REGIONS.map(r=><Button key={r} size="small" variant="weak" color={r===region?'primary':'dark'} aria-pressed={r===region} onClick={()=>{setRegion(r);setSelectedRoom(null);}}>{r}</Button>)}<Button className="region-request-button" size="small" variant="weak" color="dark" onClick={()=>{setRequestedRegion('');setCustomRegion('');setShowCustomRegion(false);open('region-request');}}>+ 지역 추가 요청</Button></div>
      <div className="list-heading"><span><i className="green-dot"/>{localRooms.reduce((sum,r)=>sum+r.count,0)}명 머무는 중</span></div>
      {newRoom && <div className="new-room-notice" role="status">{newRoom}호점이 열렸어요.</div>}
      <div className="room-list" role="group" aria-label="입장할 호점 선택">{localRooms.map(r=><div className={`room-row ${selected?.number===r.number?'selected':''}`} key={r.number}>
        <button className="room-select" aria-pressed={selected?.number===r.number} aria-label={`${region} ${r.number}호점 선택${r.count===CAPACITY?', 만석':''}`} onClick={()=>setSelectedRoom({region,number:r.number})}>
          <span className="selection-dot" aria-hidden="true">{selected?.number===r.number&&<Check size={13}/>}</span>
          <strong>{r.number}호점</strong>
          <Badge size="small" variant="weak" color={r.count===CAPACITY?'elephant':'blue'}>{r.count===CAPACITY?'만석':r.count===0?'새로 열림':'입장 가능'}</Badge>
          <span className="room-count"><b>{r.count}</b> / 12</span>
        </button>
        {selected?.number===r.number&&<div className="selected-room-detail"><span>{r.count===CAPACITY?'빈자리가 생기면 알려드려요':`빈자리 ${CAPACITY-r.count}석`}</span>{r.count===CAPACITY?<div className="room-detail-actions"><button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'미리보기 보기':'미리보기 · 500P'}</button><button onClick={()=>requestWaitlist(r)}><Bell size={14}/>{waitlist.includes(`${region}:${r.number}`)?'알림 신청됨':'빈자리 알림'}</button></div>:<button onClick={()=>requestPreview(r)}><Eye size={14}/>{previews[`${region}:${r.number}`]?'구매한 미리보기':'미리보기 · 500P'}</button>}</div>}
      </div>)}</div>
      <p className="branch-note">자리가 다 차면 다음 호점이 열려요.</p>
      <div className="lobby-footer">
        <p className="entry-benefit">입장 시 포인트가 차감돼요.</p>
        <div className="entry-actions"><Button color="dark" variant="weak" size="xlarge" disabled={!recommended} onClick={()=>requestEntry(recommended)}>빠른 입장</Button><Button size="xlarge" disabled={!selected||selected.count===CAPACITY} onClick={()=>requestEntry(selected)}>{selected?selected.count===CAPACITY?'만석이에요':`${selected.number}호점 입장하기`:'호점을 선택해 주세요'}</Button></div>
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
            <button className={`seat ${occupied ? `occupied ${mine ? profile.gender : person.gender}` : 'empty'} ${mine ? 'mine' : ''} ${talking ? 'speaking' : ''}`} aria-label={mine ? '내 자리' : person ? `${i+1}번 손님 프로필` : i === 11 ? '빈 사장 자리로 이동' : `${i+1}번 빈자리로 이동`} onClick={() => mine ? open('profile') : person ? (setSelectedGuest(person), open('guest')) : requestMove(i)}>{occupied ? <img src={mine ? profile.photo : person.photo} alt={mine ? '내 얼굴' : '손님 얼굴'}/> : <Plus size={18}/>}</button>
            {occupied && <span className="seat-drink" title={DRINKS.find(d => d.id === personDrink)?.name}><Glass id={personDrink} seconds={leftTime} host={i===11}/><span className="sr-only">{DRINKS.find(d => d.id === personDrink)?.name}, {i===11?'시간 제한 없음':`${Math.ceil(leftTime/60)}분 남음`}</span></span>}
            {paired&&<span className="pair-marker" title="서로 속삭이는 중"><MessageCircleMore size={12} style={{transform:'scaleX(-1)'}}/><span className="sr-only">서로 속삭이는 중</span></span>}{!mine&&mutedGuests.includes(person?.id)&&<span className="muted-marker" title="음소거됨"><VolumeX size={12}/><span className="sr-only">음소거됨</span></span>}{talking && <Waves/>}{mine && <span className="me-label">나</span>}{i === 11 && <span className="host-label">{occupied ? '사장' : '사장 자리'}</span>}
          </div>;
        })}
      </div>
      <div className="conversation-status">{activeFocus?'1:1 대화 중 · 다른 사람에게는 들리지 않아요':voice.mic&&voice.level>.06?'지금 이야기하고 있어요':guestsTalking&&partners[guest?.id]?'두 손님이 1:1로 대화하고 있어요':guestsTalking?(audible?'가까운 자리에서 이야기하고 있어요':'저쪽 자리에서 이야기하고 있어요'):'빈자리를 누르면 옮길 수 있어요'}</div>
      <div className="direction-control">
        {activeFocus?<div className="focus-active"><MessageCircleMore size={17}/><span>1:1 대화 중 · 다른 사람에게는 들리지 않아요</span><button onClick={()=>{setFocusId(null);setToast('전체 대화로 돌아왔어요.');}}>전체 대화로</button></div>:focusRequest?<div className="focus-active"><span>대화 요청에 답을 기다려요</span><button onClick={()=>setFocusRequest(null)}>취소</button></div>:<>
          <div className="direction-label"><span>소리 집중 방향</span><output>{facing===0?'양쪽 고르게':`${facing<0?'왼쪽':'오른쪽'}으로 ${Math.abs(facing)}°`}</output></div>
          <div className="direction-presets"><button className={facing < -15 ? 'active' : ''} onClick={()=>setFacing(-60)}>왼쪽</button><button className={Math.abs(facing) <= 15 ? 'active' : ''} onClick={()=>setFacing(0)}>양쪽</button><button className={facing > 15 ? 'active' : ''} onClick={()=>setFacing(60)}>오른쪽</button></div><div className="direction-slider"><span aria-hidden="true">왼쪽</span><input type="range" aria-label="대화 방향 각도" min="-90" max="90" step="15" value={facing} style={{'--range-progress':`${((facing + 90) / 180) * 100}%`}} onChange={e=>setFacing(Number(e.target.value))}/><span aria-hidden="true">오른쪽</span></div>
          <div className="neighbor-actions">{neighbors.length?neighbors.map(g=><button key={g.id} onClick={()=>{setSelectedGuest(g);open('guest');}}><ArrowLeftRight size={13}/>{g.seat<seat?'왼쪽':'오른쪽'} 옆자리{partners[g.id]?' · 대화 중':'와만 대화'}</button>):<span>{seat===11?'손님 자리에 앉으면 옆자리와 대화할 수 있어요':'바로 옆자리에 손님이 오면 둘이 대화할 수 있어요'}</span>}</div>
        </>}
      </div>
      {incoming && <button className="seat-offer incoming-offer" onClick={() => open('incoming')}><ArrowLeftRight size={18}/><span>자리 양보를 부탁받았어요<small>{incomingSeconds}초 안에 수락할 수 있어요</small></span><b>+500 P</b></button>}
      {outgoing && <div className="seat-offer"><Clock3 size={18}/><span>자리 양보 답변을 기다려요<small>수락 전에는 포인트가 차감되지 않아요</small></span><button onClick={() => {setOutgoing(null);setToast('요청을 취소했어요.');}}>취소</button></div>}
      <div className="current-drink"><Glass id={wallet.drinkId} seconds={seconds} host={seat===11}/><span className="current-drink-name"><b>{currentDrink?.name}</b><small>{seat===11?'시간 제한 없음':`${Math.ceil(seconds/60)}분 남음`}</small></span><button aria-label="포인트 상점" onClick={() => open('shop')}><Wallet size={13}/>{wallet.balance.toLocaleString()} P</button></div>
      {seconds === 0 && seat !== 11 && <p role="status" className="error">이용시간이 끝났어요. 한 잔 더 주문하고 머물러요.</p>}
      <div className="controls"><button className={voice.mic ? 'mic-active' : ''} aria-pressed={voice.mic} onClick={() => seconds === 0 && seat !== 11 ? open('menu') : voice.toggle()}>{voice.mic ? <Mic size={21}/> : <MicOff size={21}/>}<span>{voice.pending ? '연결 중' : voice.mic ? '마이크 켜짐' : '마이크 꺼짐'}</span></button><button className={speaker ? 'speaker-active' : ''} aria-pressed={speaker} onClick={toggleSpeaker}><Speaker size={21}/><span>{speaker ? '스피커 켜짐' : '스피커 꺼짐'}</span></button><button className={soundOn ? 'sound-active' : ''} aria-pressed={soundOn} onClick={() => {setSoundOn(v=>!v);window.speechSynthesis?.cancel();}}>{soundOn ? <Volume2 size={21}/> : <VolumeX size={21}/>}<span>{soundOn ? '소리 켜짐' : '소리 꺼짐'}</span></button><button className="order-control" onClick={() => {setSelection(wallet.drinkId || 'highball'); open('menu');}}><Wine size={21}/><span>한 잔 더</span></button></div>
    </section>}
      <BottomSheet open={!!sheet} onClose={() => {setSheet(null);setError('');}} ariaLabelledBy="sheet-title" className="app-bottom-sheet" maxHeight={['welcome','menu','shop','preview','profile','guest','settings','region-request'].includes(sheet) ? window.innerHeight * .92 : undefined}>
      <div className={`sheet sheet-compact ${sheet === 'guest' ? 'sheet-guest' : ''} ${sheet === 'profile' ? 'sheet-profile' : ''} ${sheet === 'region-request' ? 'sheet-region-request' : ''}`}><button className="close icon-button" aria-label="닫기" onClick={() => {setSheet(null);setError('');}}><X size={22}/></button>
      {(sheet === 'welcome' || sheet === 'menu') && <><p className="eyebrow">{isWelcome ? `${room?.region} ${room?.number}호점 입장` : '메뉴판'}</p><h2 id="sheet-title">{isWelcome ? '어떤 음료로 시작할까요?' : '한 잔 더 하고 갈까요?'}</h2><p className="sheet-description">{isWelcome ? '입장 시 포인트가 차감돼요.' : '주문한 잔은 내 사진 옆에 놓여요.'}</p><div className="menu">{DRINKS.filter(item => !isWelcome || item.minutes === 30).map(item => <button className={selection === item.id ? 'chosen' : ''} key={item.id} aria-pressed={selection === item.id} onClick={() => {setSelection(item.id);setError('');}}><div className="drink-illustration"><Glass id={item.id}/></div><span><strong>{item.name}</strong><small>{item.note}</small><em>{`+${item.minutes}분`}</em></span><span className="menu-price">{isWelcome ? `입장 ${item.price.toLocaleString()}P` : `${item.price.toLocaleString()} P`}{selection === item.id && <Check size={16}/>}</span></button>)}</div><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>{isWelcome ? '입장 후 남는 포인트' : '주문 후 남는 포인트'}<strong>{Math.max(0,wallet.balance-price).toLocaleString()} P</strong></span></div><p className="digital-note">음료는 취향을 표현하는 아이템이에요.</p>{wallet.balance<price?<><div className="insufficient-state"><strong>{(price-wallet.balance).toLocaleString()}P가 더 필요해요</strong><span>충전 후 {isWelcome ? '입장' : '주문'}할 수 있어요.</span></div><Button className="sheet-recharge-cta" size="xlarge" display="block" onClick={()=>open('shop')}>포인트 충전하기</Button><p className="footnote">포인트를 충전하면 선택한 음료로 바로 이용할 수 있어요.</p></>:<div className="sheet-inline-cta"><Button size="xlarge" display="block" onClick={confirmOrder}>{isWelcome ? `${price.toLocaleString()} 포인트로 ${chosen.minutes}분 입장하기` : `${price.toLocaleString()} 포인트로 주문 · ${chosen.minutes}분 연장`}</Button><p className="footnote">{isWelcome ? '입장한 호점에서만 이용시간이 흐르고, 바를 나가면 이용이 끝나요.' : '주문을 누르면 포인트가 차감되고 이용시간이 늘어나요.'}</p></div>}</>}
      {sheet === 'preview' && previewRoom && <><p className="eyebrow">{previewRoom.region} {previewRoom.number}호점</p><h2 id="sheet-title">{purchasedPreview ? '지금 이 바의 손님들' : '들어가기 전에 살짝 볼까요?'}</h2>{purchasedPreview ? <><p className="sheet-description">구매한 시점의 손님들이에요. 입장할 때는 달라질 수 있어요.</p><div className="preview-portraits">{purchasedPreview.guests.map(g => <div key={g.id} className={g.gender}><img src={g.photo} alt="미리보기 손님"/></div>)}</div>{rooms[previewRoom.region].find(r => r.number === previewRoom.number)?.count === CAPACITY ? <Button size="xlarge" display="block" onClick={() => requestWaitlist(previewRoom)}><Bell size={17}/>빈자리 알림 신청</Button> : <Button size="xlarge" display="block" onClick={() => requestEntry(previewRoom)}>이 바에 입장하기</Button>}</> : <><div className="locked-preview"><LockKeyhole size={29}/><span>사진은 미리보기 구매 후 공개돼요.</span></div><p className="sheet-description">500P로 현재 손님들의 프로필 사진을 확인해요.<br/>미리보기에는 입장이나 자리 예약이 포함되지 않아요.</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>구매 후 남는 포인트<strong>{Math.max(0,wallet.balance-500).toLocaleString()} P</strong></span></div><Button size="xlarge" display="block" disabled={wallet.balance < 500} onClick={buyPreview}>500P로 미리보기</Button></>}</>}
      {sheet === 'incoming' && incoming && <><p className="eyebrow">자리 양보 요청</p><h2 id="sheet-title">자리 바꿔주실래요?</h2><p className="sheet-description">다른 손님이 지금 내 자리를 부탁했어요.<br/>{incomingSeconds}초 안에 수락하면 500P를 받아요.<br/>오늘 남은 보상 {Math.max(0,DAILY_SWAP_REWARD_LIMIT-dailySwapRewards)}회</p><div className="swap-reward"><ArrowLeftRight size={24}/><strong>+500 P</strong><span>수락과 동시에 적립</span></div><div className="actions"><Button color="dark" variant="weak" onClick={() => {setIncoming(null);setSheet(null);}}>거절하기</Button><Button size="xlarge" disabled={dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT} onClick={() => settleSwap(incoming)}>{dailySwapRewards >= DAILY_SWAP_REWARD_LIMIT ? '오늘 보상 한도에 도달했어요' : '양보하고 500P 받기'}</Button></div></>}
      {sheet === 'seat-request' && selectedGuest && <><p className="eyebrow">자리 양보 부탁</p><h2 id="sheet-title">자리 양보를 부탁할까요?</h2><p className="sheet-description">상대가 수락하면 500P를 보내고 서로 자리를 바꿔요.<br/>거절하거나 취소하면 포인트는 사용되지 않아요.<br/>오늘 남은 요청 {Math.max(0,DAILY_SWAP_REQUEST_LIMIT-dailySwapRequests)}회</p><div className="order-summary"><span>보유 포인트<b>{wallet.balance.toLocaleString()} P</b></span><span>수락 후 남는 포인트<strong>{Math.max(0,wallet.balance-500).toLocaleString()} P</strong></span></div><Button size="xlarge" display="block" disabled={wallet.balance < 500 || !!outgoing || dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT || (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 2} onClick={sendSeatRequest}>{dailySwapRequests >= DAILY_SWAP_REQUEST_LIMIT ? '오늘 요청 한도에 도달했어요' : (seatRequestCounts[`${selectedGuest.id}:${selectedGuest.seat}`] || 0) >= 2 ? '요청 한도에 도달했어요' : '500 포인트로 자리 양보 부탁하기'}</Button></>}
      {sheet==='shop'&&<><h2 id="sheet-title">내 포인트</h2><div className="point-balance"><Coins size={24}/><strong>{wallet.balance.toLocaleString()}<small> P</small></strong></div>
        <h3 className="section-title">포인트 모으기</h3><div className="earn-row"><span><strong>매일 출석</strong><small>하루 한 번 1,000P</small></span><Button size="small" variant="weak" disabled={wallet.attendanceDate===today} onClick={attendance}>{wallet.attendanceDate===today?'오늘 받았어요':'1,000P 받기'}</Button></div>
        <div className="earn-row"><span><strong>자리 양보</strong><small>요청을 수락하고 서로 자리를 바꾸면</small></span><b>+500P</b></div>
        <h3 className="section-title">포인트 충전</h3><p className="shop-note">많이 충전할수록 추가 포인트를 받아요.</p><div className="point-packs">{POINT_PACKS.map(pack=><button key={pack.points} onClick={()=>{setShopPack(pack);open('charge');}}><span>{pack.points.toLocaleString()} P {pack.bonus>0&&<em>{pack.label}</em>}</span><strong>{pack.won.toLocaleString()}원 <ArrowRight size={15}/></strong></button>)}</div>
        <h3 ref={subscriptionSection} className="section-title">정기 구독</h3><div className={`subscription-card ${subscriptionCancelAt?'is-canceling':''}`}><div><strong>{SUBSCRIPTIONS[0].name}</strong><small>{subscriptionCancelAt?`${subscriptionEndLabel()}까지 이용할 수 있어요.`:SUBSCRIPTIONS[0].description}</small></div><b>{subscription?subscriptionCancelAt?'해지 예약됨':'이용 중':`${SUBSCRIPTIONS[0].price.toLocaleString()}원/월`}</b><Button size="small" variant="weak" onClick={requestSubscriptionChange}>{subscription?(subscriptionCancelAt?'해지 취소':'해지하기'):'시작하기'}</Button></div><p className="shop-note">매월 자동 결제되며, 해지해도 이용 기간 마지막 날까지 사용할 수 있어요.</p><h3 className="section-title">이렇게 사용해요</h3><div className="point-uses"><span>입장<strong>500P</strong></span><span>시간 연장<strong>30분마다 500P</strong></span><span>입장 전 손님 미리보기<strong>500P</strong></span><span>자리 양보 부탁하기<strong>수락 시 500P</strong></span></div>
        <h3 className="section-title">최근 내역 <small className="history-limit">{historyLimit===10?'최근 10건':`${Math.min(historyLimit,ledger.length)}건`}</small></h3><div className="point-history">{ledger.slice(0,historyLimit).map((item,index)=><div key={item.id}><span className="history-item-label"><strong>{item.label}</strong><small>{formatHistoryDate(item.date || Date.now() - index * 86400000)}</small></span><b className={item.amount>0?'earned':''}>{item.amount>0?'+':''}{item.amount.toLocaleString()} P</b></div>)}</div>{ledger.length>10&&<div className="history-actions">{historyLimit===10?<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(Math.min(30,ledger.length))}>전체 내역 보기</Button>:<>{historyLimit>=ledger.length&&<p className="history-complete">모든 내역을 보고 있어요.</p>}<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(10)}>최근 10건만 보기</Button>{historyLimit<ledger.length&&<Button size="small" variant="weak" display="block" onClick={()=>setHistoryLimit(v=>Math.min(v+20,ledger.length))}>더 불러오기</Button>}</>}</div>}</>}
      {sheet==='charge'&&<><h2 id="sheet-title">포인트 충전</h2><div className="point-balance"><Coins size={24}/><strong>{shopPack.points.toLocaleString()} P</strong></div><div className="order-summary"><span>상품 금액<strong>{shopPack.won.toLocaleString()}원</strong></span><span>충전 후 포인트<b>{(wallet.balance+shopPack.points).toLocaleString()} P</b></span></div><p className="sheet-description">결제 후 {shopPack.points.toLocaleString()}P가 충전돼요. 결제 수단은 토스에서 안전하게 처리돼요.</p><Button display="block" onClick={()=>setToast(`${shopPack.points.toLocaleString()}P 충전을 진행할게요.`)}>결제하고 충전하기</Button><Button display="block" variant="weak" color="dark" onClick={()=>open('shop')}>다른 상품 보기</Button></>}
      {sheet==='subscription-confirm'&&<><p className="eyebrow">정기 구독</p><h2 id="sheet-title">{!subscription?'정기 구독을 시작할까요?':subscriptionCancelAt?'구독을 다시 유지할까요?':'정기 구독을 해지할까요?'}</h2><p className="sheet-description">{!subscription?`매월 ${SUBSCRIPTIONS[0].price.toLocaleString()}원이 자동 결제되고 포인트 차감 없이 이용할 수 있어요.`:subscriptionCancelAt?`${subscriptionEndLabel()}까지 이용할 수 있고, 그 전에 다시 유지할 수 있어요.`:`자동 결제는 멈추지만 ${subscriptionEndLabel()}까지 이용할 수 있어요.`}</p><div className="actions"><Button color="dark" variant="weak" onClick={()=>setSheet('shop')}>취소</Button><Button size="xlarge" onClick={confirmSubscriptionChange}>{!subscription?'구독 시작하기':subscriptionCancelAt?'구독 유지하기':'해지 예약하기'}</Button></div></>}
      {sheet==='notifications'&&<><h2 id="sheet-title">알림</h2>{notifications.length===0?<p className="sheet-description">새로운 알림이 없어요.</p>:<div className="notification-list">{notifications.map(item=><button key={item.id} onClick={()=>{if(item.type==='inquiry'){const inquiry=inquiries.find(entry=>entry.id===item.inquiryId);setSelectedInquiry(inquiry);setSheet('inquiry-detail');}else{setRegion(item.region);setSelectedRoom({region:item.region,number:item.number});setSheet(null);setToast(`${item.region} ${item.number}호점을 선택했어요.`);}}}><Bell size={17}/><span><strong>{item.title}</strong><small>{item.body}</small></span><ArrowRight size={16}/></button>)}</div>}</>}
      {sheet === 'profile' && <><div className="sheet-heading-row"><div><p className="eyebrow">내 프로필</p><h2 id="sheet-title">내 얼굴 사진을 골라주세요</h2></div></div><p className="sheet-description">함께 앉을 사람들에게 보여줄 사진을 골라요.</p><input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto}/><button className="upload" onClick={() => upload.current.click()}>{profile.photo ? <img src={profile.photo} alt="선택한 내 사진"/> : <Camera size={30}/>}<span>{profile.photo ? '사진 바꾸기' : '사진 등록하기'}</span></button><p className="photo-note">본인 얼굴 사진을 사용해 주세요.</p><div className="gender-choice">{[['male','남성'],['female','여성']].map(([value,label]) => <button key={value} aria-pressed={profile.gender === value} className={profile.gender === value ? `selected ${value}` : ''} onClick={() => setProfile(v => ({...v,gender:value}))}>{label}{profile.gender === value && <Check size={17}/>}</button>)}</div><Button size="xlarge" display="block" disabled={!profile.photo || !profile.gender} onClick={() => setSheet('verify-profile')}>{profileVerified ? '프로필 저장하기' : '본인 얼굴 확인하기'}</Button></>}
      {sheet === 'verify-profile' && <><p className="eyebrow">본인 얼굴 확인</p><h2 id="sheet-title">얼굴을 한 번 촬영해 주세요</h2><p className="sheet-description">프로필 사진과 비교하기 위한 촬영이에요. 촬영본은 저장하거나 공개하지 않고 확인 후 바로 삭제해요.</p><div className="camera-preview"><video ref={cameraVideo} playsInline muted aria-label="본인 얼굴 촬영 화면"/><canvas ref={cameraCanvas} hidden/></div><p className={`photo-note verification-message ${verificationState==='verified'?'is-verified':''}`}>{verificationMessage}</p>{verificationState==='verified'?<Button size="xlarge" display="block" onClick={() => { setSheet(null); setToast('프로필 등록이 완료됐어요.'); }}>확인하고 시작하기</Button>:<><Button size="xlarge" display="block" disabled={verificationState!=='ready'} onClick={captureVerification}>지금 촬영하기</Button><Button variant="weak" color="dark" display="block" onClick={() => { setProfileVerified(false); setSheet(null); setToast('프로필을 저장했어요. 본인 확인은 설정에서 이어서 할 수 있어요.'); }}>나중에 확인하기</Button></>}</>}
      {sheet === 'settings' && <><p className="eyebrow">설정</p><h2 id="sheet-title">도움이 필요하신가요?</h2><p className="sheet-description">서비스 이용과 계정을 관리할 수 있어요.</p><div className="settings-group"><span>도움말</span><div className="settings-list"><button onClick={()=>open('support')}>고객센터<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>신고·문의<ArrowRight size={16}/></button></div></div><div className="settings-group"><span>계정 및 결제</span><div className="settings-list"><button onClick={openSubscriptionManager}>결제·정기 구독 관리<ArrowRight size={16}/></button><button onClick={()=>open('withdraw')} className="danger-link">회원탈퇴<ArrowRight size={16}/></button></div></div></>}
      {sheet === 'region-request' && <><p className="eyebrow">지역 추가 요청</p><h2 id="sheet-title">어디에서 만나고 싶나요?</h2><p className="sheet-description">원하는 지역을 골라 주세요.</p>{REGION_REQUEST_GROUPS.map(group=><div className="region-request-section" key={group.title}><span>{group.title}</span><div className="region-request-grid">{group.options.map(item=><button key={item} className={requestedRegion===item?'selected':''} onClick={()=>{setRequestedRegion(item);setShowCustomRegion(false);}}>{item}</button>)}{group.title==='주요 도시'&&<button style={{borderStyle:'dashed',borderWidth:'1.5px',borderColor:'#b7c0cb'}} className={`custom-region-toggle ${showCustomRegion?'selected':''}`} onClick={()=>{setShowCustomRegion(v=>!v);setRequestedRegion('');}}>직접 입력</button>}</div></div>)}{showCustomRegion&&<input className="custom-region-input" value={customRegion} onChange={e=>setCustomRegion(e.target.value)} placeholder="지역명을 입력해 주세요" maxLength={20}/>}<Button display="block" disabled={!requestedRegion && !(showCustomRegion&&customRegion.trim())} onClick={()=>{const requested=(showCustomRegion?customRegion:requestedRegion).trim();setRequestedRegion('');setCustomRegion('');setShowCustomRegion(false);setSheet(null);setToast(`${requested} 추가 요청을 접수했어요.`);}}>이 지역 추가 요청하기</Button><p className="digital-note">요청 건수와 우선순위에 따라 지역을 추가해요.</p></>}
      {sheet === 'support' && <><p className="eyebrow">고객센터</p><h2 id="sheet-title">무엇을 도와드릴까요?</h2><p className="sheet-description">혼술바 이용 중 궁금한 점을 확인하거나 문의를 남겨 주세요.</p><div className="settings-list"><button onClick={()=>{setOpenFaq(null);open('faq')}}>자주 묻는 질문<ArrowRight size={16}/></button><button onClick={()=>open('inquiry')}>문의 남기기<ArrowRight size={16}/></button></div></>}
      {sheet === 'faq' && <><p className="eyebrow">자주 묻는 질문</p><h2 id="sheet-title">혼술바 이용 안내</h2><p className="sheet-description">자주 궁금해하는 내용을 모아봤어요.</p><div className="faq-list">{FAQ_ITEMS.map(([question,answer],index)=><div className={`faq-item ${openFaq===index?'open':''}`} key={question}><button onClick={()=>setOpenFaq(openFaq===index?null:index)}><span>{question}</span>{openFaq===index?<ChevronDown size={17}/>:<ArrowRight size={17}/>}</button>{openFaq===index&&<p>{answer}</p>}</div>)}</div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>답을 찾지 못했어요 · 문의하기</Button></>}
      {sheet === 'inquiry' && <><p className="eyebrow">신고·문의</p><h2 id="sheet-title">문의 내용을 남겨 주세요</h2><p className="sheet-description">확인 후 운영팀이 순서대로 답변드릴게요.</p><div className="form-choice">{['결제·구독 문의','이용 방법 문의','서비스 신고','기타 문의'].map(item=><button key={item} className={inquiryType===item?'selected':''} onClick={()=>setInquiryType(item)}>{item}</button>)}</div><textarea className="support-textarea" value={inquiryMessage} onChange={e=>setInquiryMessage(e.target.value)} placeholder={inquiryType==='서비스 신고'?'신고할 내용을 자세히 입력해 주세요.':'문의 내용을 입력해 주세요.'} maxLength={500}/><div className="form-footer"><span>{inquiryMessage.length}/500</span><Button size="large" disabled={!inquiryMessage.trim()} onClick={submitInquiry}>{inquiryType==='서비스 신고'?'신고 접수하기':'문의 접수하기'}</Button></div></>}
      {sheet === 'inquiry-detail' && selectedInquiry && <><p className="eyebrow">문의 답변</p><h2 id="sheet-title">운영팀 답변</h2><div className="inquiry-message"><small>{selectedInquiry.type}</small><p>{selectedInquiry.message}</p></div><div className="inquiry-answer"><strong>운영팀</strong><p>{selectedInquiry.answer || '문의 내용을 확인하고 있어요. 답변이 등록되면 알림으로 알려드릴게요.'}</p></div><Button display="block" variant="weak" color="dark" onClick={()=>open('inquiry')}>문의 남기기</Button></>}
      {sheet === 'withdraw' && <><p className="eyebrow">회원탈퇴</p><h2 id="sheet-title">정말 탈퇴할까요?</h2><p className="sheet-description">프로필과 이용 기록이 삭제되고, 진행 중인 정기 구독은 먼저 해지해야 해요.<br/>삭제된 정보는 복구할 수 없어요.</p><div className="actions"><Button color="dark" variant="weak" onClick={()=>setSheet('profile')}>취소</Button><Button size="xlarge" onClick={()=>{setSheet(null);setToast('탈퇴 요청을 접수했어요.');}}>탈퇴하기</Button></div></>}
      {sheet === 'move' && <><h2 id="sheet-title">옆자리 분께 인사하고 갈까요?</h2><p className="sheet-description">가볍게 인사를 건네고 자리를 옮겨요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>머무르기</Button><Button size="xlarge" onClick={() => commitMove(pendingSeat)}>자리 옮기기</Button></div></>}
      {sheet === 'guest' && selectedGuest && <><div className="guest-photo"><img src={selectedGuest.photo} alt="선택한 손님"/><Glass id={selectedGuest.drinkId}/></div><h2 id="sheet-title">{DRINKS.find(d => d.id === selectedGuest.drinkId)?.name} 마시는 중</h2><p className="sheet-description">{partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?'옆자리와 잠시 대화하고 있어요.':`내 자리에서 ${Math.round(audioGain({id:'me',seat},selectedGuest,facing,partners,mutedGuests)*100)}% 크기로 들려요.`}</p>
        {partners[selectedGuest.id]&&partners[selectedGuest.id]!=='me'?<div className="guest-focus-panel"><MessageCircleMore size={18}/><p>지금 1:1로 대화하고 있어요.<br/>다른 사람에게는 목소리가 들리지 않아요.</p><Button size="large" variant="weak" disabled={waveSent.includes(selectedGuest.id)} onClick={()=>{setWaveSent(v=>[...v,selectedGuest.id]);setToast('인사를 남겼어요. 대화가 끝나면 확인할 수 있어요.');}}>{waveSent.includes(selectedGuest.id)?'인사를 남겼어요':'손 흔들기'}</Button></div>:activeFocus===selectedGuest.id?<Button display="block" variant="weak" onClick={()=>{setFocusId(null);setSheet(null);}}>전체 대화로 돌아가기</Button>:<div className="guest-focus-panel"><Button size="large" display="block" disabled={!adjacent(seat,selectedGuest.seat)||!!activeFocus||!!focusRequest||mutedGuests.includes(selectedGuest.id)||seconds===0} onClick={()=>requestFocus(selectedGuest)}>이 옆자리와만 대화하기</Button><p>{!adjacent(seat,selectedGuest.seat)?'바로 옆에 앉아 있을 때 이용할 수 있어요.':'상대가 수락하면 서로의 목소리만 들려요. 자리를 옮기면 전체 대화로 돌아가요.'}</p></div>}
        <Button className="guest-seat-request" size="large" variant="weak" color="dark" display="block" disabled={!!outgoing || wallet.balance < 500} onClick={() => open('seat-request')}><ArrowLeftRight size={17}/>이 자리 부탁하기 · 500P</Button><p className="footnote">상대가 수락하면 서로 자리를 바꿔요.</p><div className="guest-actions"><button onClick={() => {if(activeFocus===selectedGuest.id) setFocusId(null);setFocusRequest(null);setMutedGuests(v => v.includes(selectedGuest.id) ? v.filter(id => id !== selectedGuest.id) : [...v,selectedGuest.id]);setSheet(null);}}><VolumeX size={15}/>{mutedGuests.includes(selectedGuest.id) ? '음소거 해제' : selectedGuest.seat===11 ? '사장 음소거' : '음소거'}</button><button onClick={() => open('report')}><Flag size={15}/>신고</button></div></>}
      {sheet === 'report' && <><p className="eyebrow">신고하기</p><h2 id="sheet-title">어떤 일이 있었나요?</h2><p className="sheet-description">신고 내용은 운영팀이 확인하고 필요한 조치를 진행해요.</p><div className="form-choice report-choice">{['사진 도용·허위 프로필','욕설·불쾌한 발언','광고·금전 요구','기타'].map(reason=><button key={reason} className={reportReason===reason?'selected':''} onClick={()=>setReportReason(reason)}>{reason}</button>)}</div><textarea className="support-textarea" value={reportMessage} onChange={e=>setReportMessage(e.target.value)} placeholder="상황을 자세히 알려 주세요. (선택)" maxLength={500}/><div className="form-footer"><span>{reportMessage.length}/500</span><Button size="large" disabled={!reportReason} onClick={()=>{setMutedGuests(v=>[...new Set([...v,selectedGuest.id])]);setSheet(null);setToast('신고가 접수됐어요. 확인 후 조치할게요.');setReportReason('');setReportMessage('');}}>신고 접수하기</Button></div></>}
      {sheet === 'leave' && <><DoorOpen size={28}/><h2 id="sheet-title">오늘은 여기까지 할까요?</h2><p className="sheet-description">바를 나가면 이번 방문의 이용이 끝나요.<br/>다음 호점은 새로 입장해 주세요.</p><div className="actions"><Button color="dark" variant="weak" onClick={() => setSheet(null)}>더 머무르기</Button><Button size="xlarge" onClick={leave}>바 나가기</Button></div></>}
      {error && <p className="error" role="alert">{error}</p>}
    </div></BottomSheet>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
