import React from 'react';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Aspect, Chart, Planet } from '../types';
import { colors } from '../theme';
import { normalizeDegrees, wheelAngle } from '../domain';

const SIZE = 560;
const CENTER = SIZE / 2;
const OUTER = 272;
const ZODIAC_OUTER = 248;
const ZODIAC_INNER = 208;
const ASPECT_RADIUS = 150;
const PLANET_RADIUS = 181;
const SIGNS = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
const SIGN_COLORS = ['#dc5547', '#43895e', '#d17d2d', '#456bb3', '#dc5547', '#43895e', '#d17d2d', '#456bb3', '#dc5547', '#43895e', '#456bb3', '#456bb3'];
const normalize = normalizeDegrees;

function point(angle: number, radius: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) };
}

function position(longitude: number) {
  const minutes = Math.round(normalize(longitude) * 60) % 1800;
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, '0')}′`;
}

function aspectColor(type: string) {
  if (['Square', 'Opposition'].includes(type)) return colors.red;
  if (['Trine', 'Sextile'].includes(type)) return colors.blue;
  if (type === 'Conjunction') return colors.green;
  return '#8c8795';
}

function spread(planets: Planet[], gap: number) {
  if (planets.length < 2) return planets.map(planet => ({ ...planet, displayLongitude: planet.longitude }));
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
  let cut = 0;
  let largest = -1;
  sorted.forEach((planet, index) => {
    const next = sorted[(index + 1) % sorted.length];
    const distance = normalize(next.longitude - planet.longitude);
    if (distance > largest) { largest = distance; cut = (index + 1) % sorted.length; }
  });
  const ordered = [...sorted.slice(cut), ...sorted.slice(0, cut)];
  const start = ordered[0].longitude;
  let previous = start;
  return ordered.map((planet, index) => {
    let actual = planet.longitude;
    if (actual < start) actual += 360;
    const displayLongitude = index ? Math.max(actual, previous + gap) : actual;
    previous = displayLongitude;
    return { ...planet, displayLongitude };
  });
}

export function ChartWheel({ chart }: { chart: Chart }) {
  const ascendant = chart.angles.ascendant.longitude;
  const at = (longitude: number, radius: number) => point(wheelAngle(longitude, ascendant), radius);
  const natal = spread(chart.natal, 8.5);
  const aspects = chart.mode === 'SYNASTRY' ? chart.aspects : chart.natalAspects;
  const source = chart.mode === 'SYNASTRY' ? chart.planets : chart.natal;

  const renderAspect = (aspect: Aspect, index: number) => {
    const from = source.find(planet => planet.name === aspect.from);
    const to = chart.natal.find(planet => planet.name === aspect.to);
    if (!from || !to) return null;
    const a = at(from.longitude, ASPECT_RADIUS);
    const b = at(to.longitude, ASPECT_RADIUS);
    if (aspect.type === 'Conjunction') {
      const delta = normalize(to.longitude - from.longitude);
      const middle = at(from.longitude + (delta > 180 ? delta - 360 : delta) / 2, ASPECT_RADIUS - 16);
      return <Path key={`${aspect.from}-${aspect.to}-${index}`} d={`M ${a.x} ${a.y} Q ${middle.x} ${middle.y} ${b.x} ${b.y}`} stroke={aspectColor(aspect.type)} strokeWidth={1.8} fill="none" />;
    }
    return <Line key={`${aspect.from}-${aspect.to}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={aspectColor(aspect.type)} strokeWidth={aspect.orb < 1 ? 2.2 : 1.25} opacity={0.9} />;
  };

  return (
    <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" accessibilityLabel="Astrology chart wheel with Ascendant at nine o'clock">
      <Circle cx={CENTER} cy={CENTER} r={OUTER} fill="#e9f6f5" />
      <Circle cx={CENTER} cy={CENTER} r={ZODIAC_OUTER} fill={colors.paper} stroke={colors.ink} strokeWidth={1.2} />
      <Circle cx={CENTER} cy={CENTER} r={ZODIAC_INNER} fill="#faf7ed" stroke={colors.ink} strokeWidth={1} />
      <Circle cx={CENTER} cy={CENTER} r={ASPECT_RADIUS} fill="#fffdf8" stroke={colors.border} />

      {Array.from({ length: 180 }, (_, index) => index * 2).map(degree => {
        const outer = at(degree, ZODIAC_OUTER);
        const length = degree % 10 === 0 ? 8 : degree % 5 === 0 ? 5 : 3;
        const inner = at(degree, ZODIAC_OUTER - length);
        return <Line key={`tick-${degree}`} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={colors.ink} strokeWidth={degree % 10 === 0 ? 1 : 0.5} />;
      })}

      {SIGNS.map((glyph, index) => {
        const inner = at(index * 30, ZODIAC_INNER);
        const outer = at(index * 30, ZODIAC_OUTER);
        const label = at(index * 30 + 15, 227);
        return <G key={glyph + index}>
          <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#85808c" />
          <SvgText x={label.x} y={label.y + 8} textAnchor="middle" fontSize={28} fill={SIGN_COLORS[index]}>{glyph}</SvgText>
        </G>;
      })}

      {chart.houses.map((house, index) => {
        const next = chart.houses[(index + 1) % chart.houses.length];
        const start = at(house.longitude, 30);
        const end = at(house.longitude, ZODIAC_INNER);
        const label = at(house.longitude + normalize(next.longitude - house.longitude) / 2, 49);
        const major = house.number === 1 || house.number === 10;
        return <G key={house.number}>
          <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={colors.ink} strokeWidth={major ? 3 : 1} />
          <SvgText x={label.x} y={label.y + 4} textAnchor="middle" fontSize={12} fill={colors.ink}>{house.number}</SvgText>
        </G>;
      })}

      {aspects.map(renderAspect)}

      {natal.map(planet => {
        const exact = at(planet.longitude, ZODIAC_INNER);
        const leader = at(planet.displayLongitude, 194);
        const glyph = at(planet.displayLongitude, PLANET_RADIUS);
        const degree = at(planet.displayLongitude, 164);
        return <G key={planet.name}>
          <Line x1={exact.x} y1={exact.y} x2={leader.x} y2={leader.y} stroke={colors.ink} strokeWidth={0.8} />
          <Circle cx={glyph.x} cy={glyph.y - 3} r={12} fill={colors.paper} />
          <SvgText x={glyph.x} y={glyph.y + 4} textAnchor="middle" fontSize={21} fill={colors.ink}>{planet.glyph}</SvgText>
          <SvgText x={degree.x} y={degree.y + 3} textAnchor="middle" fontSize={8.5} fill={colors.ink}>{planet.degree}°{String(planet.minute).padStart(2, '0')}′</SvgText>
          {planet.retrograde && <SvgText x={glyph.x + 10} y={glyph.y - 10} fontSize={8} fill={colors.red}>R</SvgText>}
        </G>;
      })}

      <Circle cx={CENTER} cy={CENTER} r={24} fill={colors.paper} stroke={colors.border} />
      <SvgText x={CENTER} y={CENTER + 4} textAnchor="middle" fontSize={10} fill={colors.violet}>ASTERIVUM</SvgText>

      {[
        ['ASC', chart.angles.ascendant.longitude], ['DSC', chart.angles.ascendant.longitude + 180],
        ['MC', chart.angles.midheaven.longitude], ['IC', chart.angles.midheaven.longitude + 180],
      ].map(([label, longitude]) => {
        const spot = at(longitude as number, 263);
        return <G key={label as string}>
          <Circle cx={spot.x} cy={spot.y} r={20} fill={label === 'ASC' || label === 'MC' ? colors.goldSoft : colors.paper} stroke={colors.gold} />
          <SvgText x={spot.x} y={spot.y - 1} textAnchor="middle" fontSize={10} fontWeight="700" fill={colors.ink}>{label}</SvgText>
          <SvgText x={spot.x} y={spot.y + 11} textAnchor="middle" fontSize={7.5} fill={colors.ink}>{position(longitude as number)}</SvgText>
        </G>;
      })}
    </Svg>
  );
}
