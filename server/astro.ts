import { Body, Ecliptic, EquatorFromVector, GeoVector, RotateVector, Rotation_EQJ_EQD, SiderealTime } from 'astronomy-engine';
import type { BirthData } from './types.js';

export const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
export const GLYPHS: Record<string, string> = { Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂', Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇', Node:'☊' };
const BODIES = [Body.Sun, Body.Moon, Body.Mercury, Body.Venus, Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto];
const ASPECTS = [
  { name:'Conjunction', angle:0, orb:8, glyph:'☌' }, { name:'Sextile', angle:60, orb:4, glyph:'⚹' },
  { name:'Square', angle:90, orb:6, glyph:'□' }, { name:'Trine', angle:120, orb:6, glyph:'△' },
  { name:'Opposition', angle:180, orb:8, glyph:'☍' },
];
export const TRANSIT_ASPECT_NAMES = ASPECTS.map(aspect => aspect.name);

const normalize = (n: number) => ((n % 360) + 360) % 360;
const angularDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function birthToUtc(data: BirthData): Date {
  const [y,m,d] = data.birthDate.split('-').map(Number);
  const [hh,mm] = data.birthTime.split(':').map(Number);
  const offset = data.timezoneId
    ? utcOffsetAtLocalTime(data.birthDate, data.birthTime, data.timezoneId)
    : data.timezone;
  return new Date(Date.UTC(y, m - 1, d, hh - offset, mm || 0));
}

export function utcOffsetAtLocalTime(date:string, time:string, timeZone:string) {
  const [year,month,day] = date.split('-').map(Number);
  const [hour,minute] = time.split(':').map(Number);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute || 0);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(new Date(wallTimeAsUtc));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return (Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute)) - wallTimeAsUtc) / 3600000;
}

function meanNode(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  return normalize(125.04452 - 1934.136261 * t + 0.0020708 * t * t);
}

function obliquity(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  return 23.439291 - 0.0130042 * t;
}

export function ascendant(date: Date, latitude: number, longitude: number) {
  const lst = normalize(SiderealTime(date) * 15 + longitude) * Math.PI / 180;
  const eps = obliquity(date) * Math.PI / 180;
  const lat = latitude * Math.PI / 180;
  const asc = Math.atan2(-Math.cos(lst), Math.sin(eps) * Math.tan(lat) + Math.cos(eps) * Math.sin(lst));
  return normalize(asc * 180 / Math.PI + 180);
}

export function midheaven(date: Date, longitude: number) {
  const ramc = normalize(SiderealTime(date) * 15 + longitude) * Math.PI / 180;
  const eps = obliquity(date) * Math.PI / 180;
  return normalize(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * 180 / Math.PI);
}

function planetLongitude(body: Body, date: Date) {
  return Ecliptic(GeoVector(body, date, true)).elon;
}

function position(name: string, longitude: number, retrograde = false) {
  const lon = normalize(longitude);
  const roundedMinutes = Math.round(lon * 60) % (360 * 60);
  const signIndex = Math.floor(roundedMinutes / (30 * 60));
  const signMinutes = roundedMinutes % (30 * 60);
  return { name, glyph: GLYPHS[name], longitude: lon, sign: SIGNS[signIndex], signIndex, degree:Math.floor(signMinutes / 60), minute:signMinutes % 60, retrograde };
}

function orderedCusps(asc: number, mc: number, calculate: (house:2|3|11|12) => number) {
  const facesForward = (start:number, candidate:number) => candidate < start
    ? Math.abs(candidate - start) < 180
    : candidate - start >= 180;
  const orient = (start:number, candidate:number) => facesForward(start, candidate)
    ? normalize(candidate + 180)
    : normalize(candidate);
  const cusp2 = normalize(calculate(2)), cusp3 = normalize(calculate(3));
  const cusp11 = normalize(calculate(11)), cusp12 = normalize(calculate(12));
  return [
    asc,
    orient(asc, cusp2),
    orient(asc, cusp3),
    normalize(mc + 180),
    orient(normalize(mc + 180), normalize(cusp11 + 180)),
    orient(normalize(mc + 180), normalize(cusp12 + 180)),
    normalize(asc + 180),
    orient(normalize(asc + 180), normalize(cusp2 + 180)),
    orient(normalize(asc + 180), normalize(cusp3 + 180)),
    mc,
    orient(mc, cusp11),
    orient(mc, cusp12),
  ].map(normalize);
}

function placidusCusps(date:Date, latitude:number, longitude:number, asc:number, mc:number) {
  // Placidus semi-arc division is undefined inside the polar circles. Equal house
  // is a deterministic fallback for those locations instead of returning NaN.
  if (Math.abs(latitude) >= 66.562) return null;
  const ramc = normalize(SiderealTime(date) * 15 + longitude);
  const eps = obliquity(date);
  const radians = (degrees:number) => degrees * Math.PI / 180;
  const degrees = (value:number) => value * 180 / Math.PI;
  const sin = (value:number) => Math.sin(radians(value));
  const cos = (value:number) => Math.cos(radians(value));
  const tan = (value:number) => Math.tan(radians(value));
  const calculate = (house:2|3|11|12) => {
    const fraction = house === 2 || house === 12 ? 2 / 3 : 1 / 3;
    const offset = house === 2 ? 120 : house === 3 ? 150 : house === 11 ? 30 : 60;
    const adjustedRamc = ramc + offset;
    let current = Math.asin(sin(eps) * sin(adjustedRamc));
    let previous = Number.POSITIVE_INFINITY;
    for (let iteration = 0; iteration < 100 && Math.abs(current - previous) > 0.000001; iteration++) {
      const correction = Math.atan(fraction * (tan(latitude) / cos(adjustedRamc)));
      previous = current;
      current = Math.atan(tan(adjustedRamc) * Math.cos(correction) / Math.cos(correction + radians(eps)));
    }
    return degrees(current) + 180;
  };
  const cusps = orderedCusps(asc, mc, calculate);
  return cusps.every(Number.isFinite) ? cusps : null;
}

function houseCusps(date:Date, latitude:number, longitude:number, asc: number, mc:number, system: BirthData['houseSystem']) {
  const start = system === 'WHOLE_SIGN' ? Math.floor(asc / 30) * 30 : asc;
  if (system === 'PLACIDUS') return placidusCusps(date, latitude, longitude, asc, mc)
    || Array.from({ length:12 }, (_, i) => normalize(asc + i * 30));
  return Array.from({ length: 12 }, (_, i) => normalize(start + i * 30));
}

function aspectsBetween(a: ReturnType<typeof position>[], b = a, crossOnly = false) {
  const found: Array<Record<string, unknown>> = [];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (!crossOnly && j <= i) continue;
    const delta = angularDistance(a[i].longitude, b[j].longitude);
    const aspect = ASPECTS.find(x => Math.abs(delta - x.angle) <= x.orb);
    if (aspect) found.push({ from:a[i].name, to:b[j].name, type:aspect.name, glyph:aspect.glyph, angle:aspect.angle, orb:Number(Math.abs(delta-aspect.angle).toFixed(2)), applying:null });
  }
  return found.sort((x,y) => Number(x.orb) - Number(y.orb));
}

export function calculateSky(date: Date, zodiac: BirthData['zodiac'] = 'TROPICAL') {
  const ayanamsa = zodiac === 'SIDEREAL' ? 24.18 : 0;
  const planets = BODIES.map(body => {
    const lon = normalize(planetLongitude(body, date) - ayanamsa);
    const before = normalize(planetLongitude(body, new Date(date.getTime() - 6 * 3600000)) - ayanamsa);
    const after = normalize(planetLongitude(body, new Date(date.getTime() + 6 * 3600000)) - ayanamsa);
    const motion = ((after - before + 540) % 360) - 180;
    return position(body, lon, motion < 0);
  });
  planets.push(position('Node', meanNode(date) - ayanamsa, true));
  return planets;
}

export function calculateChart(data: BirthData, mode: 'NATAL'|'TRANSIT'|'PROGRESSION' = 'NATAL', targetDate?: Date) {
  const natalDate = birthToUtc(data);
  let chartDate = natalDate;
  if (mode === 'TRANSIT') chartDate = targetDate || new Date();
  if (mode === 'PROGRESSION') {
    const target = targetDate || new Date();
    chartDate = new Date(natalDate.getTime() + ((target.getTime() - natalDate.getTime()) / 365.2422));
  }
  const planets = calculateSky(chartDate, data.zodiac);
  // Transit and progression wheels remain anchored to the natal angles/houses.
  const asc = ascendant(natalDate, data.latitude, data.longitude);
  const mc = midheaven(natalDate, data.longitude);
  const houses = houseCusps(natalDate, data.latitude, data.longitude, asc, mc, data.houseSystem).map((longitude, i) => ({ number:i+1, longitude, sign:SIGNS[Math.floor(longitude/30)] }));
  const natal = mode === 'NATAL' ? planets : calculateSky(natalDate, data.zodiac);
  const natalAspects = aspectsBetween(natal);
  return {
    mode, chartDate:chartDate.toISOString(), natalDate:natalDate.toISOString(), planets, natal,
    angles:{ ascendant:position('Ascendant', asc), midheaven:position('Midheaven', mc) },
    houses, aspects:mode === 'NATAL' ? natalAspects : aspectsBetween(planets, natal, true), natalAspects,
    settings:{ zodiac:data.zodiac || 'TROPICAL', houseSystem:data.houseSystem || 'PLACIDUS', houseAccuracy:data.houseSystem === 'PLACIDUS' && Math.abs(data.latitude) >= 66.562 ? 'Equal-house fallback: Placidus is undefined inside the polar circles' : 'Exact' },
  };
}

export function calculateSynastry(first:BirthData, second:BirthData, language:'en'|'pt-PT'='en') {
  const firstChart = calculateChart(first);
  const secondChart = calculateChart(second);
  const aspects = aspectsBetween(secondChart.natal, firstChart.natal, true);
  const relational = new Set(['Sun','Moon','Mercury','Venus','Mars','Saturn']);
  const weighted = aspects.filter(aspect => relational.has(String(aspect.from)) || relational.has(String(aspect.to)));
  const harmony = weighted.filter(aspect => ['Trine','Sextile'].includes(String(aspect.type))).length;
  const tension = weighted.filter(aspect => ['Square','Opposition'].includes(String(aspect.type))).length;
  const conjunctions = weighted.filter(aspect => aspect.type === 'Conjunction').length;
  const score = Math.max(10,Math.min(90,Math.round(50 + (harmony - tension) * 4 + conjunctions * 2)));
  return {
    chart:{ ...firstChart, mode:'SYNASTRY', chartDate:secondChart.natalDate, planets:secondChart.natal, aspects },
    summary:{ score,harmony,tension,conjunctions,total:aspects.length,
      label:language === 'pt-PT' ? (score>=70?'Naturalmente favorável':score>=55?'Favorável com desafios de crescimento':score>=40?'Mista e evolutiva':'Forte tensão e elevada consciência') : (score>=70?'Naturally supportive':score>=55?'Supportive with growth edges':score>=40?'Mixed and developmental':'High-friction, high-awareness') },
    highlights:aspects.slice(0,18).map(aspect => ({ ...aspect,
      tone:language === 'pt-PT' ? (['Trine','Sextile'].includes(String(aspect.type))?'Favorável':['Square','Opposition'].includes(String(aspect.type))?'Evolutivo':'Intensificador') : (['Trine','Sextile'].includes(String(aspect.type))?'Supportive':['Square','Opposition'].includes(String(aspect.type))?'Developmental':'Intensifying'),
      interpretation:language === 'pt-PT'
        ? `${aspect.from} de ${second.name} forma ${String(aspect.type).toLowerCase()} com ${aspect.to} de ${first.name}. Este contacto ${aspect.type === 'Trine' || aspect.type === 'Sextile' ? 'favorece a cooperação e a compreensão mútua' : aspect.type === 'Square' || aspect.type === 'Opposition' ? 'cria uma diferença recorrente que beneficia de negociação consciente' : 'torna este tema evidente e difícil de ignorar'}.`
        : `${second.name}'s ${aspect.from} ${aspect.type === 'Conjunction' ? 'is conjunct' : `${String(aspect.type).toLowerCase()}s`} ${first.name}'s ${aspect.to}. This ${aspect.type === 'Trine' || aspect.type === 'Sextile' ? 'supports cooperation and mutual understanding' : aspect.type === 'Square' || aspect.type === 'Opposition' ? 'creates a recurring difference that benefits from conscious negotiation' : 'makes this theme prominent and difficult to ignore'}.`,
    })),
  };
}

export function astrocartography(data:BirthData) {
  const date = birthToUtc(data);
  const gst = SiderealTime(date) * 15;
  const lines:Array<{planet:string;glyph:string;angle:'MC'|'IC'|'ASC'|'DSC';points:{latitude:number;longitude:number}[]}> = [];
  for (const body of BODIES) {
    const equatorial = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(date),GeoVector(body,date,true)));
    const rightAscension = equatorial.ra * 15;
    const declination = equatorial.dec * Math.PI / 180;
    const meridian = normalize(rightAscension - gst + 180) - 180;
    lines.push({ planet:String(body),glyph:GLYPHS[String(body)],angle:'MC',points:[{latitude:-85,longitude:meridian},{latitude:85,longitude:meridian}] });
    lines.push({ planet:String(body),glyph:GLYPHS[String(body)],angle:'IC',points:[{latitude:-85,longitude:normalize(meridian+360)-180},{latitude:85,longitude:normalize(meridian+360)-180}] });
    const asc:{latitude:number;longitude:number}[] = [], dsc:{latitude:number;longitude:number}[] = [];
    for (let latitude=-66; latitude<=66; latitude+=2) {
      const lat = latitude * Math.PI / 180;
      const cosine = -Math.tan(lat) * Math.tan(declination);
      if (Math.abs(cosine) > 1) continue;
      const hourAngle = Math.acos(cosine) * 180 / Math.PI;
      asc.push({latitude,longitude:normalize(rightAscension-hourAngle-gst+180)-180});
      dsc.push({latitude,longitude:normalize(rightAscension+hourAngle-gst+180)-180});
    }
    lines.push({planet:String(body),glyph:GLYPHS[String(body)],angle:'ASC',points:asc});
    lines.push({planet:String(body),glyph:GLYPHS[String(body)],angle:'DSC',points:dsc});
  }
  return { date:date.toISOString(), birthplace:{latitude:data.latitude,longitude:data.longitude,place:data.place}, lines };
}

export function ephemeris(start: Date, end: Date, stepDays = 1, zodiac: BirthData['zodiac'] = 'TROPICAL') {
  const rows = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + stepDays * 86400000)) {
    rows.push({ date:d.toISOString(), planets:calculateSky(d, zodiac) });
    if (rows.length > 1100) break;
  }
  return rows;
}

export function forecast(data: BirthData, start: Date, end: Date, stepDays = 1) {
  const natal = calculateSky(birthToUtc(data), data.zodiac);
  const events: Array<Record<string, unknown>> = [];
  let previous = new Set<string>();
  for (let d = new Date(start); d <= end; d = new Date(d.getTime()+stepDays*86400000)) {
    const transits = calculateSky(d, data.zodiac).filter(p => !['Moon','Node'].includes(p.name));
    const current = aspectsBetween(transits, natal, true).filter(a => Number(a.orb) <= 1.2);
    const keys = new Set(current.map(a => `${a.from}-${a.type}-${a.to}`));
    current.forEach(a => { const key = `${a.from}-${a.type}-${a.to}`; if (!previous.has(key)) events.push({ date:d.toISOString(), ...a }); });
    previous = keys;
    if (events.length > 600) break;
  }
  return events;
}

type TransitScope = 'SLOW' | 'ALL';
type TransitHit = { date:string; retrograde:boolean; orb:number };
type ActiveTransit = {
  key:string; transitPlanet:string; natalPlanet:string; aspect:string; glyph:string;
  startDate:string; startsBeforeRange:boolean; exactHits:TransitHit[];
  peakDate:string; peakOrb:number; previousResidual:number; previousPreviousResidual?:number;
  previousDate:string; previousPreviousDate?:string;
};

const interpolateDate = (from:Date, to:Date, fraction:number) =>
  new Date(from.getTime() + (to.getTime() - from.getTime()) * Math.max(0, Math.min(1, fraction)));

function boundaryDate(from:Date, to:Date, fromResidual:number, toResidual:number, orb:number) {
  const denominator = Math.abs(toResidual) - Math.abs(fromResidual);
  return interpolateDate(from, to, denominator === 0 ? 0.5 : (orb - Math.abs(fromResidual)) / denominator);
}

function houseForLongitude(longitude:number, houses:{number:number;longitude:number}[]) {
  for (let index = 0; index < houses.length; index++) {
    const start = houses[index].longitude;
    const next = houses[(index + 1) % houses.length].longitude;
    if (normalize(longitude - start) < normalize(next - start)) return houses[index].number;
  }
  return 1;
}

const transitThemes:Record<string,string> = {
  Sun:'visibility, vitality, purpose and conscious direction', Moon:'emotional needs, habits, belonging and daily response',
  Mercury:'thinking, decisions, messages and learning', Venus:'relationships, values, pleasure and resources',
  Mars:'drive, assertion, conflict and decisive action', Jupiter:'growth, opportunity, confidence and meaning',
  Saturn:'responsibility, limits, maturity and durable structure', Uranus:'liberation, disruption, experimentation and awakening',
  Neptune:'imagination, sensitivity, ideals and dissolving boundaries', Pluto:'power, endings, regeneration and deep psychological change',
};
const natalThemes:Record<string,string> = {
  Sun:'identity and life purpose', Moon:'emotional security and instinctive needs', Mercury:'mind and communication style',
  Venus:'relationships, values and receptivity', Mars:'will, desire and self-assertion', Jupiter:'beliefs, confidence and growth pattern',
  Saturn:'duties, fears and capacity for mastery', Uranus:'need for freedom and originality', Neptune:'ideals, imagination and sensitivity',
  Pluto:'relationship with power and transformation', Node:'developmental direction and recurring life lessons',
};
const aspectLanguage:Record<string,string> = {
  Conjunction:'merges and intensifies these two principles', Sextile:'opens a constructive opportunity that grows through deliberate participation',
  Square:'creates productive friction and requires a concrete adjustment', Trine:'allows the energies to cooperate naturally, though conscious use prevents complacency',
  Opposition:'brings the tension into relationships or external circumstances and asks for balance',
};
const houseThemes = ['identity, body and self-direction','income, skills and personal values','learning, communication and the immediate environment','home, family and emotional foundations','creativity, romance, children and self-expression','work, health, craft and daily systems','partnership, contracts and one-to-one encounters','shared resources, intimacy, loss and renewal','travel, higher learning, belief and perspective','career, reputation, authority and public contribution','community, allies, networks and future plans','rest, retreat, endings, spirituality and the unconscious'];
const ordinal = (value:number) => `${value}${value===1?'st':value===2?'nd':value===3?'rd':'th'}`;

const transitThemesPt:Record<string,string> = {
  Sun:'visibilidade, vitalidade, propósito e direção consciente', Moon:'necessidades emocionais, hábitos, pertença e resposta quotidiana', Mercury:'pensamento, decisões, mensagens e aprendizagem', Venus:'relações, valores, prazer e recursos', Mars:'impulso, afirmação, conflito e ação decisiva', Jupiter:'crescimento, oportunidade, confiança e sentido', Saturn:'responsabilidade, limites, maturidade e estrutura duradoura', Uranus:'libertação, rutura, experimentação e despertar', Neptune:'imaginação, sensibilidade, ideais e dissolução de limites', Pluto:'poder, finais, regeneração e transformação psicológica profunda',
};
const natalThemesPt:Record<string,string> = {
  Sun:'identidade e propósito de vida', Moon:'segurança emocional e necessidades instintivas', Mercury:'mente e estilo de comunicação', Venus:'relações, valores e recetividade', Mars:'vontade, desejo e autoafirmação', Jupiter:'crenças, confiança e padrão de crescimento', Saturn:'deveres, receios e capacidade de domínio', Uranus:'necessidade de liberdade e originalidade', Neptune:'ideais, imaginação e sensibilidade', Pluto:'relação com o poder e a transformação', Node:'direção evolutiva e aprendizagens recorrentes',
};
const aspectLanguagePt:Record<string,string> = {
  Conjunction:'funde e intensifica estes dois princípios', Sextile:'abre uma oportunidade construtiva que cresce através da participação deliberada', Square:'cria fricção produtiva e exige um ajustamento concreto', Trine:'permite que as energias cooperem naturalmente, embora o uso consciente evite a complacência', Opposition:'leva a tensão às relações ou circunstâncias externas e pede equilíbrio',
};
const houseThemesPt = ['identidade, corpo e autodireção','rendimentos, competências e valores pessoais','aprendizagem, comunicação e ambiente próximo','lar, família e bases emocionais','criatividade, romance, filhos e autoexpressão','trabalho, saúde, prática e sistemas quotidianos','parcerias, contratos e encontros individuais','recursos partilhados, intimidade, perda e renovação','viagens, ensino superior, crenças e perspetiva','carreira, reputação, autoridade e contributo público','comunidade, aliados, redes e planos futuros','descanso, retiro, finais, espiritualidade e inconsciente'];
const astrologyPt:Record<string,string> = { Sun:'Sol',Moon:'Lua',Mercury:'Mercúrio',Venus:'Vénus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno',Uranus:'Urano',Neptune:'Neptuno',Pluto:'Plutão',Node:'Nodo',Aries:'Carneiro',Taurus:'Touro',Gemini:'Gémeos',Cancer:'Caranguejo',Leo:'Leão',Virgo:'Virgem',Libra:'Balança',Scorpio:'Escorpião',Sagittarius:'Sagitário',Capricorn:'Capricórnio',Aquarius:'Aquário',Pisces:'Peixes',Conjunction:'conjunção',Sextile:'sextil',Square:'quadratura',Trine:'trígono',Opposition:'oposição' };

function transitInterpretation(transitPlanet:string, aspect:string, natalPlanet:string, sign:string, house:number, language:'en'|'pt-PT'='en') {
  if (language === 'pt-PT') return `${astrologyPt[transitPlanet] || transitPlanet} enfatiza ${transitThemesPt[transitPlanet] || 'mudança e desenvolvimento'}. Em ${astrologyPt[sign] || sign} e na casa ${house}, isto manifesta-se através de ${houseThemesPt[house-1]}. O aspeto ${astrologyPt[aspect] || aspect.toLowerCase()} ${aspectLanguagePt[aspect] || 'liga estes temas'} ao ${astrologyPt[natalPlanet] || natalPlanet} natal, descrevendo ${natalThemesPt[natalPlanet] || 'um padrão natal pessoal'}. Considere as datas mais fortes e exatas como picos de um processo mais longo, não como acontecimentos isolados.`;
  return `${transitPlanet} emphasizes ${transitThemes[transitPlanet] || 'change and development'}. In ${sign} and the ${ordinal(house)} house, this works through ${houseThemes[house-1]}. The ${aspect.toLowerCase()} ${aspectLanguage[aspect] || 'connects these themes'} with natal ${natalPlanet}, describing ${natalThemes[natalPlanet] || 'a personal natal pattern'}. Treat the strongest and exact dates as peaks inside a longer process, not isolated events.`;
}

/** A printable transit report: each item covers an orb-entry to orb-exit window. */
export function transitReport(
  data:BirthData,
  start:Date,
  end:Date,
  options:{ scope?:TransitScope; orb?:number; aspects?:string[]; language?:'en'|'pt-PT' } = {},
) {
  const scope = options.scope || 'SLOW';
  const orb = Math.max(0.5, Math.min(5, options.orb || 3));
  const selectedAspects = ASPECTS.filter(aspect => !options.aspects?.length || options.aspects.includes(aspect.name));
  const natalChart = calculateChart(data);
  const natal = natalChart.natal;
  const slowPlanets = new Set(['Jupiter','Saturn','Uranus','Neptune','Pluto']);
  const stepHours = scope === 'ALL' ? 6 : 12;
  const stepMs = stepHours * 3600000;
  const active = new Map<string, ActiveTransit>();
  const previous = new Map<string, { residual:number; date:Date }>();
  const events:Array<Record<string, unknown>> = [];

  const finish = (item:ActiveTransit, endDate:Date, continuesBeyondRange=false) => {
    const peakPlanet = calculateSky(new Date(item.peakDate), data.zodiac).find(planet => planet.name === item.transitPlanet)!;
    const strength = Math.round(100 * (1 - Math.min(item.peakOrb, orb) / orb));
    const strengthLabel = options.language === 'pt-PT' ? (strength >= 95 ? 'Exato' : strength >= 80 ? 'Muito forte' : strength >= 60 ? 'Forte' : 'Moderado') : (strength >= 95 ? 'Exact' : strength >= 80 ? 'Very strong' : strength >= 60 ? 'Strong' : 'Moderate');
    events.push({
      id:`${item.key}-${item.startDate}`, transitPlanet:item.transitPlanet, natalPlanet:item.natalPlanet,
      aspect:item.aspect, glyph:item.glyph, startDate:item.startDate, endDate:endDate.toISOString(),
      exactHits:item.exactHits, peakDate:item.peakDate, peakOrb:Number(item.peakOrb.toFixed(2)),
      strength, strengthLabel, transitSign:peakPlanet.sign,
      natalHouse:houseForLongitude(peakPlanet.longitude, natalChart.houses),
      hasRetrogradePass:item.exactHits.some(hit => hit.retrograde),
      startsBeforeRange:item.startsBeforeRange, continuesBeyondRange,
      interpretation:transitInterpretation(item.transitPlanet,item.aspect,item.natalPlanet,peakPlanet.sign,houseForLongitude(peakPlanet.longitude,natalChart.houses),options.language),
    });
  };

  for (let timestamp = start.getTime(); timestamp <= end.getTime(); timestamp += stepMs) {
    const date = new Date(timestamp);
    const transits = calculateSky(date, data.zodiac).filter(planet =>
      planet.name !== 'Node' && (scope === 'ALL' || slowPlanets.has(planet.name)),
    );
    for (const transit of transits) for (const natalPlanet of natal) for (const aspect of selectedAspects) {
      const key = `${transit.name}-${aspect.name}-${natalPlanet.name}`;
      const residual = angularDistance(transit.longitude, natalPlanet.longitude) - aspect.angle;
      const prior = previous.get(key);
      let item = active.get(key);

      if (Math.abs(residual) <= orb && !item) {
        const entered = prior && Math.abs(prior.residual) > orb
          ? boundaryDate(prior.date, date, prior.residual, residual, orb)
          : start;
        item = {
          key, transitPlanet:transit.name, natalPlanet:natalPlanet.name, aspect:aspect.name, glyph:aspect.glyph,
          startDate:entered.toISOString(), startsBeforeRange:!prior, exactHits:[], peakDate:date.toISOString(),
          peakOrb:Math.abs(residual), previousResidual:residual, previousDate:date.toISOString(),
        };
        active.set(key, item);
      }

      if (item) {
        if (Math.abs(residual) < item.peakOrb) {
          item.peakOrb = Math.abs(residual);
          item.peakDate = date.toISOString();
        }
        if (prior && prior.residual * residual < 0) {
          const exactDate = interpolateDate(prior.date, date, Math.abs(prior.residual) / (Math.abs(prior.residual) + Math.abs(residual)));
          if (!item.exactHits.some(hit => Math.abs(new Date(hit.date).getTime() - exactDate.getTime()) < stepMs)) {
            item.exactHits.push({ date:exactDate.toISOString(), retrograde:transit.retrograde, orb:0 });
          }
        }
        // Conjunctions and stations can touch exactness without crossing the signed residual.
        if (item.previousPreviousResidual !== undefined &&
            Math.abs(item.previousResidual) <= Math.abs(item.previousPreviousResidual) &&
            Math.abs(item.previousResidual) <= Math.abs(residual) && Math.abs(item.previousResidual) <= 0.35) {
          const exactDate = new Date(item.previousDate);
          if (!item.exactHits.some(hit => Math.abs(new Date(hit.date).getTime() - exactDate.getTime()) < stepMs * 2)) {
            const exactPlanet = calculateSky(exactDate, data.zodiac).find(planet => planet.name === transit.name)!;
            item.exactHits.push({ date:exactDate.toISOString(), retrograde:exactPlanet.retrograde, orb:Number(Math.abs(item.previousResidual).toFixed(2)) });
          }
        }
        item.previousPreviousResidual = item.previousResidual;
        item.previousPreviousDate = item.previousDate;
        item.previousResidual = residual;
        item.previousDate = date.toISOString();

        if (Math.abs(residual) > orb) {
          const exited = prior ? boundaryDate(prior.date, date, prior.residual, residual, orb) : date;
          finish(item, exited);
          active.delete(key);
        }
      }
      previous.set(key, { residual, date });
    }
  }
  active.forEach(item => finish(item, end, true));
  return events.sort((a,b) => String(a.startDate).localeCompare(String(b.startDate)));
}

export const astroInternals = { normalize, angularDistance, position, houseCusps };
