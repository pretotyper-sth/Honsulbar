import { CAPACITY, REGIONS } from './model.js';

const PREFERRED_REGION_WAIT_MS = 20_000;

export function findAvailableBars(rooms, preferredRegion, elapsed, excluded = []) {
  function availableIn(region) {
    return (rooms[region] || [])
      .filter(room => room.count > 0 && room.count < CAPACITY && !room.hasReportedGuest &&
        !excluded.includes(`${region}:${room.number}`))
      .sort((a, b) => Math.abs(a.count - 7) - Math.abs(b.count - 7))
      .map(room => ({ ...room, region }));
  }
  const preferred = availableIn(preferredRegion);
  if (preferred.length || elapsed < PREFERRED_REGION_WAIT_MS) return preferred;
  return REGIONS.filter(region => region !== preferredRegion).flatMap(availableIn);
}
