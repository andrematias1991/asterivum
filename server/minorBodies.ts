import {
  Body,
  Ecliptic,
  GravitySimulator,
  HelioVector,
  MakeTime,
  StateVector,
  Vector,
} from 'astronomy-engine';

const DAY_MS = 86_400_000;
const CHIRON_STEP_MS = 5 * DAY_MS;
const MAX_CACHE_ENTRIES = 2048;
const CHIRON_EPOCH = new Date('2000-01-01T12:00:00.000Z');

// JPL Horizons 2060 Chiron heliocentric EQJ state at JD 2451545.0.
// Reference frame: J2000 mean equator/equinox. Units: AU and AU/day.
const CHIRON_INITIAL = new StateVector(
  -3.529597323721606,
  -8.675401114502414,
  -2.935904700117773,
  4.971227226758336e-3,
  -3.626418894486951e-3,
  -8.257960206970693e-4,
  MakeTime(CHIRON_EPOCH),
);

const chironStateCache = new Map<number, StateVector>([
  [CHIRON_EPOCH.getTime(), CHIRON_INITIAL],
]);

function trimCache() {
  while (chironStateCache.size > MAX_CACHE_ENTRIES) {
    const oldest = chironStateCache.keys().next().value as number | undefined;
    if (oldest === undefined) return;
    if (oldest === CHIRON_EPOCH.getTime()) {
      const epoch = chironStateCache.get(oldest)!;
      chironStateCache.delete(oldest);
      chironStateCache.set(oldest, epoch);
      continue;
    }
    chironStateCache.delete(oldest);
  }
}

function nearestCachedState(target: number) {
  let nearestTime = CHIRON_EPOCH.getTime();
  let nearestState = CHIRON_INITIAL;
  let distance = Math.abs(target - nearestTime);
  for (const [time, state] of chironStateCache) {
    const candidate = Math.abs(target - time);
    if (candidate < distance) {
      nearestTime = time;
      nearestState = state;
      distance = candidate;
    }
  }
  return { time:nearestTime, state:nearestState };
}

export function chironHeliocentricState(date: Date) {
  const target = date.getTime();
  const cached = chironStateCache.get(target);
  if (cached) return cached;

  const nearest = nearestCachedState(target);
  const simulator = new GravitySimulator(Body.Sun, new Date(nearest.time), [nearest.state]);
  const direction = Math.sign(target - nearest.time);
  let current = nearest.time;
  let state = nearest.state;
  while (direction * (target - current) > 0) {
    current += direction * Math.min(CHIRON_STEP_MS, Math.abs(target - current));
    state = simulator.Update(new Date(current))[0];
  }
  chironStateCache.set(target, state);
  trimCache();
  return state;
}

export function chironGeocentricVector(date: Date) {
  const chiron = chironHeliocentricState(date);
  const earth = HelioVector(Body.Earth, date);
  return new Vector(
    chiron.x - earth.x,
    chiron.y - earth.y,
    chiron.z - earth.z,
    MakeTime(date),
  );
}

export function chironLongitude(date: Date) {
  return Ecliptic(chironGeocentricVector(date)).elon;
}

/**
 * Mean Black Moon Lilith is the mean lunar apogee, opposite the mean perigee.
 * Meeus-style polynomial, referred to the true ecliptic/equinox of date.
 */
export function meanLilithLongitude(date: Date) {
  const julianDay = date.getTime() / DAY_MS + 2440587.5;
  const t = (julianDay - 2451545.0) / 36525;
  const perigee = 83.3532465
    + 4069.0137287 * t
    - 0.01032 * t * t
    - t * t * t / 80053
    + t ** 4 / 18999000;
  return ((perigee + 180) % 360 + 360) % 360;
}

