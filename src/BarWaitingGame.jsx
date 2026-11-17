import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Wine, X } from 'lucide-react';

const COASTER_CENTER = 50;
const COASTER_RADIUS = 7;
const MEMORY_PADS = [1, 2, 3];
const randomPad = () => MEMORY_PADS[Math.floor(Math.random() * MEMORY_PADS.length)];

function CoasterGame() {
  const [phase, setPhase] = useState('ready');
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const glass = useRef(null);
  const position = useRef(8);

  useEffect(() => {
    if (phase !== 'moving') return undefined;
    const roundMs = Math.max(950, 2200 - streak * 130);
    const start = performance.now();
    let frame;
    function advance(now) {
      const progress = ((now - start) % roundMs) / roundMs;
      position.current = 8 + 84 * (1 - Math.abs(2 * progress - 1));
      if (glass.current) glass.current.style.left = `${position.current}%`;
      frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [phase, streak]);

  function play() {
    if (phase === 'moving') {
      const hit = Math.abs(position.current - COASTER_CENTER) <= COASTER_RADIUS;
      const next = hit ? streak + 1 : 0;
      setStreak(next);
      setBest(Math.max(best, next));
      setPhase(hit ? 'hit' : 'miss');
      return;
    }
    position.current = 8;
    if (glass.current) glass.current.style.left = '8%';
    setPhase('moving');
  }

  return <>
    <div className="bar-waiting-track" aria-hidden="true">
      <span className="bar-waiting-coaster"/>
      <span ref={glass} className="bar-waiting-glass" style={{left:'8%'}}><Wine size={20}/></span>
    </div>
    <div className="bar-waiting-actions">
      <p role="status">{phase === 'hit' ? `딱 맞았어요! ${streak}연속 성공` :
        phase === 'miss' ? `아깝네요! 최고 ${best}연속` :
        streak ? `${streak}연속 · 잔이 조금 더 빨라져요.` : '잔이 코스터 위에 오면 놓아 주세요.'}</p>
      <button type="button" className="bar-waiting-play" onClick={play}>
        {phase === 'moving' ? '잔 놓기' : phase === 'hit' ? '다음 라운드' : phase === 'miss' ? '다시 하기' : '시작'}
      </button>
    </div>
  </>;
}

function CoasterMemory() {
  const [sequence, setSequence] = useState([]);
  const [phase, setPhase] = useState('ready');
  const [flash, setFlash] = useState(null);
  const [input, setInput] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    if (phase !== 'showing') return undefined;
    const beat = 650;
    const initialDelay = 180;
    const timers = sequence.flatMap((pad, index) => [
      setTimeout(() => setFlash(pad), initialDelay + index * beat),
      setTimeout(() => setFlash(null), initialDelay + index * beat + 400),
    ]);
    timers.push(setTimeout(() => setPhase('repeat'), initialDelay + sequence.length * beat));
    return () => timers.forEach(clearTimeout);
  }, [phase, sequence]);

  function start() {
    setInput(0);
    setSequence(phase === 'next' ? [...sequence, randomPad()] : [randomPad(), randomPad()]);
    setPhase('showing');
  }

  function choose(pad) {
    if (phase !== 'repeat') return;
    if (sequence[input] !== pad) { setPhase('miss'); return; }
    if (input + 1 === sequence.length) {
      setBest(Math.max(best, sequence.length));
      setPhase('next');
    }
    setInput(input + 1);
  }

  const prompt = phase === 'showing' ? (flash ? `${flash}번 코스터` : '켜지는 순서를 기억해 주세요.') :
    phase === 'repeat' ? `같은 순서로 눌러 주세요. ${input}/${sequence.length}` :
    phase === 'next' ? `${sequence.length}개 성공! 다음은 ${sequence.length + 1}개예요.` :
    phase === 'miss' ? `순서가 달라요. 최고 ${best}개` : '코스터가 켜지는 순서를 기억해 보세요.';

  return <>
    <div className="bar-memory-pads" role="group" aria-label="코스터 번호">
      {MEMORY_PADS.map(pad => <button key={pad} type="button" data-lit={flash === pad}
        aria-label={`${pad}번 코스터`} disabled={phase !== 'repeat'} onClick={() => choose(pad)}>{pad}</button>)}
    </div>
    <div className="bar-waiting-actions">
      <p role="status">{prompt}</p>
      {(phase === 'ready' || phase === 'miss' || phase === 'next') && <button type="button" className="bar-waiting-play" onClick={start}>
        {phase === 'next' ? '다음 라운드' : phase === 'miss' ? '다시 하기' : '시작'}
      </button>}
    </div>
  </>;
}

const MIN_GLASSES = 1;
const MAX_GLASSES = 12;
const secretCount = () => Math.floor(Math.random() * MAX_GLASSES) + MIN_GLASSES;

function GuessTheCount() {
  const [target, setTarget] = useState(secretCount);
  const [count, setCount] = useState(6);
  const [attempts, setAttempts] = useState(0);
  const [lastGuess, setLastGuess] = useState(null);
  const solved = lastGuess === target;

  function submit() {
    if (solved) {
      setTarget(secretCount());
      setCount(6);
      setAttempts(0);
      setLastGuess(null);
    } else {
      setLastGuess(count);
      setAttempts(value => value + 1);
    }
  }

  return <>
    <div className="bar-count-controls" role="group" aria-label="예상하는 잔 수">
      <button type="button" aria-label="잔 수 줄이기" disabled={solved || count === MIN_GLASSES}
        onClick={() => setCount(value => value - 1)}><Minus size={18} aria-hidden="true"/></button>
      <span aria-live="polite"><strong>{count}</strong> 잔</span>
      <button type="button" aria-label="잔 수 늘리기" disabled={solved || count === MAX_GLASSES}
        onClick={() => setCount(value => value + 1)}><Plus size={18} aria-hidden="true"/></button>
    </div>
    <div className="bar-waiting-actions">
      <p role="status">{solved ? `${attempts}번 만에 맞혔어요!` :
        lastGuess === null ? '1~12잔 중에 몇 잔을 숨겼을까요?' :
        `${lastGuess}잔보다 ${lastGuess < target ? '많아요' : '적어요'}.`}</p>
      <button type="button" className="bar-waiting-play" disabled={!solved && lastGuess === count} onClick={submit}>
        {solved ? '다시 하기' : '맞혀 보기'}
      </button>
    </div>
  </>;
}

const games = [
  { id:'coaster', label:'잔 놓기', Play:CoasterGame },
  { id:'memory', label:'코스터 기억하기', Play:CoasterMemory },
  { id:'count', label:'잔 수 맞히기', Play:GuessTheCount },
];

export function BarWaitingGame({ canPlay, arrivingGuest, safetyPaused, onClose }) {
  const [game, setGame] = useState(games[0]);
  const Play = game.Play;

  return <section id="bar-waiting-game" className="bar-waiting-game" aria-labelledby="bar-waiting-title"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
    <div className="bar-waiting-header">
      <h2 id="bar-waiting-title" className="sr-only">혼자 기다리기 게임</h2>
      {canPlay ? <div className="bar-waiting-choices" role="group" aria-label="게임 선택">
        {games.map(choice => <button key={choice.id} type="button"
          aria-pressed={game.id === choice.id} onClick={() => setGame(choice)}>{choice.label}</button>)}
      </div> : <span>게임이 멈췄어요</span>}
      <button type="button" className="bar-waiting-close" aria-label="게임 닫기" onClick={onClose}><X size={18} aria-hidden="true"/></button>
    </div>
    {canPlay ? <div className="bar-waiting-body"><Play/></div> : <div className="bar-waiting-actions">
      <p role="status">{safetyPaused ? '안전 점검 중이에요.' :
        `${arrivingGuest ? `${arrivingGuest}님` : '손님'}이 들어왔어요. 게임을 닫고 인사해 보세요.`}</p>
    </div>}
  </section>;
}
