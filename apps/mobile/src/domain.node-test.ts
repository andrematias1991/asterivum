import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompleteProfile, normalizeDegrees, wheelAngle } from './domain';
import type { Profile } from './types';

const profile: Profile = {
  name: 'Test', birthDate: '1991-09-19', birthTime: '04:35', place: 'Faro, Portugal',
  latitude: 37.02, longitude: -7.93, timezone: 1, timezoneId: 'Europe/Lisbon',
  houseSystem: 'PLACIDUS', zodiac: 'TROPICAL', notes: '', isPrimary: false,
};

test('normalizes degrees across the zero boundary', () => {
  assert.equal(normalizeDegrees(-1), 359);
  assert.equal(normalizeDegrees(361), 1);
});

test('fixes the Ascendant at nine o’clock and Descendant opposite', () => {
  assert.equal(wheelAngle(121, 121), 270);
  assert.equal(wheelAngle(301, 121), 90);
});

test('requires a selected time zone rather than typed location text', () => {
  assert.equal(isCompleteProfile(profile), true);
  assert.equal(isCompleteProfile({ ...profile, timezoneId: null }), false);
  assert.equal(isCompleteProfile({ ...profile, birthTime: '4:35' }), false);
});
