import type { Aspect, Chart, Planet } from "./types";

const CENTER = 280;
const OUTER = 274;
const ZODIAC_OUTER = 248;
const ZODIAC_INNER = 207;
const NATAL_GLYPH_RADIUS = 181;
const ASPECT_RADIUS = 153;
const signGlyphs = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
const colors = ["#e05443", "#4b9a55", "#d9852e", "#476dc4", "#d64b43", "#698a44", "#da7451", "#3d78b8", "#d35c3e", "#3c9469", "#5574bd", "#4873b8"];
const normalize = (degrees: number) => ((degrees % 360) + 360) % 360;
const formatPosition = (planet: Planet) => `${planet.degree}°${String(planet.minute).padStart(2, "0")}′`;
const longitudeDegree = (longitude: number) => {
  const totalMinutes = Math.round(normalize(longitude) * 60) % (360 * 60);
  const signMinutes = totalMinutes % (30 * 60);
  return `${Math.floor(signMinutes / 60)}°${String(signMinutes % 60).padStart(2, "0")}′`;
};

function point(angle: number, radius: number) {
  return {
    x: CENTER + radius * Math.cos((angle - 90) * Math.PI / 180),
    y: CENTER + radius * Math.sin((angle - 90) * Math.PI / 180),
  };
}

function spread(planets: Planet[], minimumGap: number) {
  if (planets.length < 2)
    return planets.map((planet) => ({ ...planet, displayLongitude: planet.longitude }));
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
  let cut = 0;
  let largestGap = -1;
  sorted.forEach((planet, index) => {
    const next = sorted[(index + 1) % sorted.length];
    const gap = normalize(next.longitude - planet.longitude);
    if (gap > largestGap) {
      largestGap = gap;
      cut = (index + 1) % sorted.length;
    }
  });
  const ordered = [...sorted.slice(cut), ...sorted.slice(0, cut)];
  const start = ordered[0].longitude;
  let previous = start;
  return ordered.map((planet, index) => {
    let actual = planet.longitude;
    if (actual < start) actual += 360;
    const displayLongitude = index === 0 ? actual : Math.max(actual, previous + minimumGap);
    previous = displayLongitude;
    return { ...planet, displayLongitude };
  });
}

function AspectFigure({
  aspect,
  fromPlanets,
  toPlanets,
  anglePoint,
  index,
}: {
  aspect: Aspect;
  fromPlanets: Planet[];
  toPlanets: Planet[];
  anglePoint: (longitude: number, radius: number) => { x: number; y: number };
  index: number;
}) {
  const from = fromPlanets.find((planet) => planet.name === aspect.from);
  const to = toPlanets.find((planet) => planet.name === aspect.to);
  if (!from || !to) return null;
  const start = anglePoint(from.longitude, ASPECT_RADIUS);
  const end = anglePoint(to.longitude, ASPECT_RADIUS);
  const className = `aspect-line ${aspect.type.toLowerCase()}`;
  if (aspect.type === "Conjunction") {
    const delta = normalize(to.longitude - from.longitude);
    const middle = anglePoint(from.longitude + (delta > 180 ? delta - 360 : delta) / 2, ASPECT_RADIUS - 18);
    return (
      <path
        d={`M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`}
        className={className}
      >
        <title>{`${aspect.from} conjunction ${aspect.to}, ${aspect.orb.toFixed(2)}° orb`}</title>
      </path>
    );
  }
  return (
    <line
      key={`${aspect.from}-${aspect.to}-${index}`}
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      className={className}
    >
      <title>{`${aspect.from} ${aspect.type.toLowerCase()} ${aspect.to}, ${aspect.orb.toFixed(2)}° orb`}</title>
    </line>
  );
}

export default function ChartWheel({ chart }: { chart: Chart }) {
  const ascendant = chart.angles.ascendant.longitude;
  const isBiWheel = chart.mode !== "NATAL";
  // Zodiac longitude increases counter-clockwise, with house one fixed at 9 o'clock.
  const wheelAngle = (longitude: number) => normalize(270 - normalize(longitude - ascendant));
  const anglePoint = (longitude: number, radius: number) => point(wheelAngle(longitude), radius);
  const natalPlanets = spread(chart.natal, 8.5);
  const movingPlanets = isBiWheel ? spread(chart.planets, 7.5) : [];
  const axes = [
    { label: "ASC", longitude: chart.angles.ascendant.longitude, className: "asc" },
    { label: "DSC", longitude: chart.angles.ascendant.longitude + 180, className: "dsc" },
    { label: "MC", longitude: chart.angles.midheaven.longitude, className: "mc" },
    { label: "IC", longitude: chart.angles.midheaven.longitude + 180, className: "ic" },
  ];

  return (
    <div className={`wheel-wrap ${isBiWheel ? "bi-wheel" : "natal-wheel"}`}>
      <svg
        className="chart-wheel"
        viewBox="0 0 560 560"
        role="img"
        aria-label={`${chart.mode.toLowerCase()} astrology chart wheel, Ascendant at nine o'clock`}
      >
        <circle cx={CENTER} cy={CENTER} r={OUTER} className="wheel-sky" />
        <circle cx={CENTER} cy={CENTER} r={ZODIAC_OUTER} className="wheel-bg" />
        <circle cx={CENTER} cy={CENTER} r={ZODIAC_INNER} className="wheel-line zodiac-inner" />
        <circle cx={CENTER} cy={CENTER} r={ASPECT_RADIUS} className="wheel-line aspect-boundary" />

        {Array.from({ length: 360 }, (_, degree) => {
          const outer = anglePoint(degree, ZODIAC_OUTER);
          const length = degree % 10 === 0 ? 9 : degree % 5 === 0 ? 6 : 3;
          const inner = anglePoint(degree, ZODIAC_OUTER - length);
          return (
            <line
              key={`tick-${degree}`}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              className={`degree-tick tick-${length}`}
            />
          );
        })}

        {signGlyphs.map((glyph, index) => {
          const boundary = anglePoint(index * 30, ZODIAC_INNER);
          const outer = anglePoint(index * 30, ZODIAC_OUTER);
          const label = anglePoint(index * 30 + 15, 226);
          return (
            <g key={glyph}>
              <path d={`M ${boundary.x} ${boundary.y} L ${outer.x} ${outer.y}`} className="zodiac-cusp" />
              <text x={label.x} y={label.y} fill={colors[index]} className="sign-glyph">{glyph}</text>
            </g>
          );
        })}

        {chart.houses.map((house, index) => {
          const next = chart.houses[(index + 1) % chart.houses.length];
          const lineStart = anglePoint(house.longitude, 30);
          const lineEnd = anglePoint(house.longitude, ZODIAC_INNER);
          const span = normalize(next.longitude - house.longitude);
          const label = anglePoint(house.longitude + span / 2, 48);
          return (
            <g key={house.number}>
              <line x1={lineStart.x} y1={lineStart.y} x2={lineEnd.x} y2={lineEnd.y} className={`house-cusp house-${house.number}`}>
                <title>{`House ${house.number}: ${longitudeDegree(house.longitude)} ${house.sign}`}</title>
              </line>
              <text x={label.x} y={label.y} className="house-number">{house.number}</text>
            </g>
          );
        })}

        <line
          {...(() => {
            const start = anglePoint(ascendant, ZODIAC_OUTER + 4);
            const end = anglePoint(ascendant + 180, ZODIAC_OUTER + 4);
            return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
          })()}
          className="angle-axis asc-axis"
        />
        <line
          {...(() => {
            const start = anglePoint(chart.angles.midheaven.longitude, ZODIAC_OUTER + 4);
            const end = anglePoint(chart.angles.midheaven.longitude + 180, ZODIAC_OUTER + 4);
            return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
          })()}
          className="angle-axis mc-axis"
        />

        {(chart.mode === "SYNASTRY" ? chart.aspects : chart.natalAspects).map((aspect, index) => (
          <AspectFigure
            key={`${aspect.from}-${aspect.type}-${aspect.to}-${index}`}
            aspect={aspect}
            fromPlanets={chart.mode === "SYNASTRY" ? chart.planets : chart.natal}
            toPlanets={chart.natal}
            anglePoint={anglePoint}
            index={index}
          />
        ))}

        {natalPlanets.map((planet) => {
          const exactOuter = anglePoint(planet.longitude, ZODIAC_INNER);
          const exactInner = anglePoint(planet.longitude, 196);
          const connectorEnd = anglePoint(planet.displayLongitude, 191);
          const glyph = anglePoint(planet.displayLongitude, NATAL_GLYPH_RADIUS);
          const position = anglePoint(planet.displayLongitude, 165);
          return (
            <g key={`natal-${planet.name}`} className="planet-marker natal-planet">
              <line x1={exactOuter.x} y1={exactOuter.y} x2={exactInner.x} y2={exactInner.y} className="planet-tick" />
              <line x1={exactInner.x} y1={exactInner.y} x2={connectorEnd.x} y2={connectorEnd.y} className="planet-leader" />
              <circle cx={glyph.x} cy={glyph.y - 4} r="11" className="planet-dot" />
              <text x={glyph.x} y={glyph.y} className="planet-glyph">{planet.glyph}</text>
              <text x={position.x} y={position.y} className="planet-position">{formatPosition(planet)}</text>
              {planet.retrograde && <text x={glyph.x + 9} y={glyph.y - 11} className="retro">℞</text>}
              <title>{`Natal ${planet.name}: ${formatPosition(planet)} ${planet.sign}${planet.retrograde ? ", retrograde" : ""}`}</title>
            </g>
          );
        })}

        {movingPlanets.map((planet) => {
          const exactInner = anglePoint(planet.longitude, ZODIAC_OUTER + 1);
          const exactOuter = anglePoint(planet.longitude, 255);
          const leader = anglePoint(planet.displayLongitude, 258);
          const glyph = anglePoint(planet.displayLongitude, 266);
          const position = anglePoint(planet.displayLongitude, 253);
          return (
            <g key={`moving-${planet.name}`} className="planet-marker moving-planet">
              <line x1={exactInner.x} y1={exactInner.y} x2={exactOuter.x} y2={exactOuter.y} className="planet-tick" />
              <line x1={exactOuter.x} y1={exactOuter.y} x2={leader.x} y2={leader.y} className="planet-leader" />
              <text x={glyph.x} y={glyph.y} className="planet-glyph">{planet.glyph}</text>
              <text x={position.x} y={position.y} className="planet-position">{formatPosition(planet)}</text>
              {planet.retrograde && <text x={glyph.x + 8} y={glyph.y - 10} className="retro">℞</text>}
              <title>{`${chart.mode === "TRANSIT" ? "Transit" : chart.mode === "SYNASTRY" ? "Partner" : "Progressed"} ${planet.name}: ${formatPosition(planet)} ${planet.sign}${planet.retrograde ? ", retrograde" : ""}`}</title>
            </g>
          );
        })}

        <circle cx={CENTER} cy={CENTER} r="28" className="center-medallion" />
        <text x={CENTER} y={CENTER - 2} className="center-title">A</text>
        <text x={CENTER} y={CENTER + 11} className="center-sub">{chart.mode === "NATAL" ? "NATAL" : chart.mode === "SYNASTRY" ? "A + B" : "N + T"}</text>

        {axes.map((axis) => {
          const base = anglePoint(axis.longitude, 262);
          const radialX = (base.x - CENTER) / 262;
          const radialY = (base.y - CENTER) / 262;
          const tangentX = -radialY;
          const tangentY = radialX;
          const label = { x:base.x - tangentX * 12, y:base.y - tangentY * 12 };
          const degree = { x:base.x + tangentX * 12, y:base.y + tangentY * 12 };
          return (
            <g key={axis.label} className={`chart-angle chart-angle-${axis.className}`}>
              <text x={label.x} y={label.y} className="angle-label">{axis.label}</text>
              <text x={degree.x} y={degree.y} className="angle-degree">{longitudeDegree(axis.longitude)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
