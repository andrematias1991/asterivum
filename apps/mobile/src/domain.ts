import type { Profile } from './types';

export const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

/** Maps zodiac longitude to the native SVG wheel with the Ascendant fixed at 9 o'clock. */
export const wheelAngle = (longitude: number, ascendant: number) =>
  normalizeDegrees(270 - normalizeDegrees(longitude - ascendant));

export function isCompleteProfile(profile: Profile) {
  return profile.name.trim().length > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)
    && /^\d{2}:\d{2}$/.test(profile.birthTime)
    && profile.place.trim().length > 0
    && typeof profile.timezoneId === 'string'
    && profile.timezoneId.length > 0
    && Number.isFinite(profile.latitude)
    && Number.isFinite(profile.longitude)
    && Number.isFinite(profile.timezone);
}

