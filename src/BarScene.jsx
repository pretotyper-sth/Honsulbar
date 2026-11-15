import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { avatarPose, cameraPitch, FIRST_PERSON_PITCH, firstPersonWalk, paintBar, partnerFacing, seatWalk, swapWalk, walkCue, wrapFacing } from './bar-scene';
import { createBarRenderer } from './bar-renderer';
import './bar-scene.css';

const views = [
  ['third', '3D 3인칭', '내 캐릭터와 바 전체를 함께 봐요.'],
  ['first', '3D 1인칭', '화면을 끌어서 듣고 싶은 쪽을 봐요.'],
  ['flat', '2D', '위에서 내려다보며 자리를 한눈에 봐요.'],
];

export function BarViewOptions({ view, onChange }) {
  return <div className="bar-view-options" role="group" aria-label="시점 선택">
    {views.map(([id, name, description]) => (
      <button type="button" key={id} aria-pressed={view === id} autoFocus={view === id} onClick={() => onChange(id)}>
        <span><strong>{name}</strong><small>{description}</small></span>
        {view === id && <Check size={18} aria-hidden="true"/>}
      </button>
    ))}
  </div>;
}

export function BarScene({ view, seat, memberId, gender, facing, partners, drinkId, seconds, elapsed, seatNeutralClock, guests, renderSeat, onUnavailable, onOpenSeats, onFacingChange, moving, onMotionChange, seatPickerRef, onCue }) {
  const canvas = useRef(null);
  const depthCanvas = useRef(null);
  const depth = useRef(null);
  const markers = useRef(null);
  const previous = useRef(new Map());
  const moves = useRef(new Map());
  const [pitch, setPitch] = useState(FIRST_PERSON_PITCH);
  const drag = useRef(null);

  function turnBy(degrees) {
    onFacingChange(value => wrapFacing(value + degrees));
  }

  function startLook(event) {
    if (moving || drag.current || (event.button !== 2 && (event.button !== 0 || event.target.closest('button')))) return;
    event.preventDefault();
    drag.current = {id:event.pointerId, x:event.clientX, y:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveLook(event) {
    const last = drag.current;
    if (moving || last?.id !== event.pointerId) return;
    const dx = event.clientX - last.x, dy = event.clientY - last.y;
    turnBy(dx * .65);
    setPitch(value => cameraPitch(value - dy * .004));
    last.x = event.clientX;
    last.y = event.clientY;
  }

  function endLook(event) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function lookKeys(event) {
    if (moving || event.target !== canvas.current) return;
    if (event.key === 'ArrowLeft') turnBy(-15);
    else if (event.key === 'ArrowRight') turnBy(15);
    else if (event.key === 'ArrowUp') setPitch(value => cameraPitch(value + .08));
    else if (event.key === 'ArrowDown') setPitch(value => cameraPitch(value - .08));
    else return;
    event.preventDefault();
  }
  const rotations = useRef(new Map());
  useLayoutEffect(() => {
    const surface = depthCanvas.current;
    const restore = () => { depth.current = createBarRenderer(surface); };
    const hold = event => event.preventDefault();
    restore();
    surface.addEventListener('webglcontextlost', hold);
    surface.addEventListener('webglcontextrestored', restore);
    return () => {
      surface.removeEventListener('webglcontextlost', hold);
      surface.removeEventListener('webglcontextrestored', restore);
      depth.current?.dispose();
      depth.current = null;
    };
  }, []);
  useLayoutEffect(() => () => onMotionChange(false), [onMotionChange]);

  useLayoutEffect(() => {
    const scene = canvas.current;
    const context = scene.getContext('2d');
    if (!context) { onUnavailable('flat'); return; }
    const buttons = [...markers.current.children];
    const myId = memberId || 'me';
    const people = [
      {id:myId, seat, mine:true, gender, facing, drinkId, seconds, unlimited:seat===11&&!seatNeutralClock},
      ...guests.map(person => {
        const unlimited = person.seat === 11 && !seatNeutralClock;
        return {...person, unlimited, seconds:unlimited ? person.seconds : Math.max(0,person.seconds-elapsed)};
      }),
    ];
    const updated = new Map(people.map(person => [person.id, person.seat]));
    const changedAt = performance.now();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const id of rotations.current.keys()) if (!updated.has(id)) rotations.current.delete(id);
    for (const person of people) {
      const partner = partners[person.mine ? 'me' : person.id];
      const partnerSeat = updated.get(partner === 'me' ? myId : partner);
      const reported = person.facing || 0;
      let turn = rotations.current.get(person.id);
      if (!turn) {
        const start = partner ? 0 : reported;
        turn = {value:start, from:start, target:start, at:changedAt};
        rotations.current.set(person.id, turn);
      }
      const startedFocus = !!partner && partner !== turn.partner;
      if (partner !== turn.partner) {
        turn.partner = partner;
        turn.reportAtFocus = reported;
        turn.awaitingFocus = startedFocus && !person.mine;
      } else if (turn.awaitingFocus && reported !== turn.reportAtFocus) {
        turn.awaitingFocus = false;
      }
      const target = turn.awaitingFocus ? partnerFacing(person.seat, partnerSeat) : reported;
      if (target !== turn.target) {
        Object.assign(turn, {from:turn.value, target, at:changedAt,
          duration:reduceMotion || (person.mine && view === 'first' && !startedFocus) ? 0 : startedFocus ? 300 : 170});
      }
    }
    for (const id of moves.current.keys()) if (!updated.has(id)) moves.current.delete(id);
    const changing = people.filter(person =>
      previous.current.has(person.id) && previous.current.get(person.id) !== person.seat);
    const staged = new Set();
    let startsAt = Math.max(changedAt, ...[...moves.current.values()].map(move => move.endsAt));
    const cameraWalk = (person, walk) => {
      const turn = rotations.current.get(person.id);
      const startYaw = avatarPose(person.seat, walk, 0, 0, -turn.value * Math.PI / 180).yaw;
      return firstPersonWalk(person.seat, walk, startYaw, -turn.target * Math.PI / 180);
    };
    const stage = (person, walk, timeline, endsAt) => {
      moves.current.set(person.id, {
        walk, timeline, endsAt, changedAt:startsAt, fromAngle:-rotations.current.get(person.id).value * Math.PI / 180, elapsed:0,
      });
      staged.add(person.id);
      if (person.mine && timeline) onMotionChange(true);
    };
    const sorted = [...changing].sort((a,b) => previous.current.get(a.id) - previous.current.get(b.id));
    if (!reduceMotion) {
      for (const person of sorted) {
        if (staged.has(person.id)) continue;
        const oldSeat = previous.current.get(person.id);
        const other = sorted.find(candidate => candidate.seat === oldSeat && previous.current.get(candidate.id) === person.seat);
        if (other) {
          const [first, second] = swapWalk(oldSeat, person.seat);
          const mine = person.mine ? first : other.mine ? second : null;
          const timeline = view === 'first' && mine ? cameraWalk(person.mine ? person : other, mine) : null;
          const duration = timeline ? timeline.duration + second.duration - mine.duration : second.duration;
          stage(person, first, timeline, startsAt + duration);
          stage(other, second, timeline, startsAt + duration);
          startsAt += duration;
        } else {
          const walk = seatWalk(oldSeat, person.seat);
          const timeline = view === 'first' && person.mine ? cameraWalk(person, walk) : null;
          const duration = timeline?.duration ?? walk.duration;
          stage(person, walk, timeline, startsAt + duration);
          startsAt += duration;
        }
      }
    } else if (changing.some(person => person.mine)) onCue('sit');
    previous.current = updated;

    let frame;
    function draw(now) {
      const {clientWidth:width, clientHeight:height} = scene;
      if (!width || !height) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const pixelsWide = Math.round(width * scale);
      const pixelsHigh = Math.round(height * scale);
      if (scene.width !== pixelsWide || scene.height !== pixelsHigh) {
        scene.width = pixelsWide;
        scene.height = pixelsHigh;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      let turning = false;
      const poses = people.map(person => {
        const move = moves.current.get(person.id);
        const time = move ? now - move.changedAt : 0;
        const camera = move?.timeline?.at(time);
        const elapsed = camera?.elapsed ?? time;
        if (move && person.mine) {
          const cue = walkCue(move.walk, move.elapsed, elapsed, view === 'first' ? 125 : undefined);
          if (cue && !document.hidden) onCue(cue);
          move.elapsed = elapsed;
        }
        if (move && elapsed >= move.walk.duration) {
          moves.current.delete(person.id);
          if (person.mine && move.timeline) onMotionChange(false);
        }
        const turn = rotations.current.get(person.id);
        const progress = turn.duration ? Math.min(1,(now-turn.at)/turn.duration) : 1;
        turn.value = turn.from + wrapFacing(turn.target-turn.from) * (1 - (1-progress) ** 2);
        turning ||= progress < 1;
        const chairAngle = -turn.value * Math.PI / 180;
        const pose = avatarPose(person.seat, move?.walk, elapsed, chairAngle, move?.fromAngle);
        if (person.mine && view === 'first' && camera && elapsed < move.walk.duration) {
          pose.yaw = camera.yaw;
          if (camera.position) pose.position = camera.position;
        }
        return { ...person, chairAngle, pose };
      });
      const points = paintBar(context, width, height, view, poses, poses[0].pose, pitch, depth.current);
      const visiblePoints = view !== 'first' ? points : points.map(point =>
        point && !points.some(other => other && other.depth < point.depth
          && Math.hypot(point.left - other.left, point.top - other.top) < 24) ? point : null
      );
      visiblePoints.forEach((point, i) => {
        const marker = buttons[i];
        const retainFocus = marker.contains(document.activeElement);
        marker.hidden = !point && !retainFocus;
        if (!point) {
          if (retainFocus) marker.style.setProperty('--spot-x', '-100px');
          return;
        }
        const spacing = Math.min(41, ...visiblePoints.map((other,j) => (
          other && i !== j ? Math.hypot(other.left - point.left, other.top - point.top) : Infinity
        )));
        const depthSize = Math.max(26, Math.min(37, 450 / point.depth));
        const diameter = point.portraitSize ?? Math.max(24, Math.min(depthSize, spacing - 2));
        marker.style.setProperty('--portrait-size', `${diameter}px`);
        marker.style.setProperty('--spot-x', `${point.left}px`);
        marker.style.setProperty('--spot-y', `${point.top}px`);
        marker.style.zIndex = Math.max(1, Math.floor(1000 - point.depth * 35));
      });
      if (moves.current.size || turning) frame = requestAnimationFrame(draw);
    }
    function redraw() {
      cancelAnimationFrame(frame);
      draw(performance.now());
    }
    const observer = new ResizeObserver(redraw);
    observer.observe(scene);
    redraw();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [view, seat, memberId, gender, facing, partners, drinkId, seconds, elapsed, seatNeutralClock, guests, pitch, onUnavailable, onMotionChange, onCue]);

  const first = view === 'first';
  return <>
    <div className={`bar-space bar-scene bar-scene-${view}${moving ? ' is-moving' : ''}`}
      onPointerDown={first ? startLook : undefined} onPointerMove={first ? moveLook : undefined}
      onPointerUp={first ? endLook : undefined} onPointerCancel={first ? endLook : undefined}
      onLostPointerCapture={first ? endLook : undefined}
      onContextMenu={first ? event => event.preventDefault() : undefined}>
      <canvas ref={depthCanvas} className="bar-scene-depth" aria-hidden="true"/>
      <canvas ref={canvas} className="bar-scene-canvas" aria-hidden={first ? undefined : true}
        role={first ? 'img' : undefined} aria-label={first ? '혼술바 1인칭 시점. 드래그하거나 방향키로 둘러보기' : undefined}
        tabIndex={first ? 0 : undefined} onKeyDown={first ? lookKeys : undefined}/>
      <div className="bar-scene-markers" ref={markers}>
        {Array.from({length:12}, (_, i) => renderSeat(i, false, moving))}
      </div>
    </div>
    {first && <div className="bar-first-controls">
      <button type="button" aria-label="왼쪽 보기" disabled={moving} onClick={() => turnBy(-45)}><ArrowLeft size={17}/></button>
      <button ref={seatPickerRef} type="button" className="bar-seat-picker" aria-haspopup="dialog" onClick={onOpenSeats}>
        자리 선택 <ChevronDown size={15} aria-hidden="true"/>
      </button>
      <button type="button" aria-label="오른쪽 보기" disabled={moving} onClick={() => turnBy(45)}><ArrowRight size={17}/></button>
    </div>}
  </>;
}
