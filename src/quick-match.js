import { CAPACITY, REGIONS } from './model.js';

const PREFERRED_REGION_WAIT_MS = 20_000;

export function findAvailableBars(rooms, preferredRegion, elapsed) {
  function availableIn(region) {
    return (rooms[region] || [])
      .filter(room => room.count > 0 && !room.hasReportedGuest)
      .sort((a, b) => a.number - b.number)
      .map(room => ({ ...room, region }));
  }
  const preferred = availableIn(preferredRegion);
  if (preferred.some(room => room.count < CAPACITY) || elapsed < PREFERRED_REGION_WAIT_MS) return preferred;
  return [...preferred, ...REGIONS.filter(region => region !== preferredRegion).flatMap(availableIn)];
}
