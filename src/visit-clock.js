const SECOND = 1000;

export function secondsOnVisitClock(clock, now) {
  if (!clock) return 0;
  if (clock.deadline === null) return clock.seconds;
  return Math.max(0, Math.ceil((clock.deadline - Math.max(now, clock.sampledAt)) / SECOND));
}

export function syncVisitClock(previous, state, receivedAt, action) {
  const visit = state.visit;
  if (!visit) return null;
  const seconds = Math.max(0, visit.seconds);
  const paused = state.safetyPaused || (!visit.away && (visit.soloPaused || (visit.seat === 11 && !state.seatNeutralClock)));
  if (paused) {
    if (previous?.visitId === visit.id && previous.deadline === null && previous.seconds === seconds) return previous;
    return { visitId:visit.id, deadline:null, seconds };
  }

  const sameVisit = previous?.visitId === visit.id && previous.deadline !== null;
  if (Number.isFinite(state.clockSampleMs) && Number.isFinite(visit.clockEndMs)) {
    if (sameVisit && previous.serverDeadline === visit.clockEndMs) return previous;
    return {
      visitId:visit.id,
      serverDeadline:visit.clockEndMs,
      sampledAt:receivedAt,
      deadline:receivedAt + Math.max(0, visit.clockEndMs - state.clockSampleMs),
    };
  }

  // Older snapshots only report rounded seconds. A heartbeat must not reset their phase.
  if (sameVisit && action !== 'order' && !(secondsOnVisitClock(previous, receivedAt) === 0 && seconds > 2)) return previous;
  return { visitId:visit.id, sampledAt:receivedAt, deadline:receivedAt + seconds * SECOND };
}

export function nextVisitTick(deadline, now) {
  const left = deadline - now;
  if (left <= 0) return null;
  return left - (Math.ceil(left / SECOND) - 1) * SECOND;
}
