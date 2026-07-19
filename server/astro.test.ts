import { describe, expect, it } from 'vitest';
import { ascendant, astrocartography, astroInternals, birthToUtc, calculateChart, calculateSynastry, ephemeris, forecast, midheaven, transitReport, utcOffsetAtLocalTime } from './astro';
import type { BirthData } from './types';

const sample:BirthData={name:'Test Native',birthDate:'1990-01-01',birthTime:'12:00',place:'Lisbon',latitude:38.7223,longitude:-9.1393,timezone:0,houseSystem:'WHOLE_SIGN',zodiac:'TROPICAL'};

describe('astrology engine',()=>{
  it('converts local birth time and UTC offset',()=>{
    expect(birthToUtc({...sample,birthTime:'14:30',timezone:2}).toISOString()).toBe('1990-01-01T12:30:00.000Z');
  });
  it('resolves historical daylight-saving time from an IANA timezone',()=>{
    expect(utcOffsetAtLocalTime('1991-09-19','04:35','Europe/Lisbon')).toBe(1);
    expect(birthToUtc({...sample,birthDate:'1991-09-19',birthTime:'04:35',timezone:0,timezoneId:'Europe/Lisbon'}).toISOString()).toBe('1991-09-19T03:35:00.000Z');
  });
  it('normalizes circular degrees',()=>{
    expect(astroInternals.normalize(-1)).toBe(359);
    expect(astroInternals.angularDistance(359,1)).toBe(2);
  });
  it('calculates a complete natal chart',()=>{
    const chart=calculateChart(sample);
    expect(chart.planets).toHaveLength(11);
    expect(chart.houses).toHaveLength(12);
    expect(chart.natalAspects).toEqual(chart.aspects);
    expect(chart.planets.every(p=>p.longitude>=0&&p.longitude<360)).toBe(true);
    expect(chart.aspects.length).toBeGreaterThan(0);
  });
  it('matches reference Ascendant, Midheaven and Placidus cusps',()=>{
    const date=new Date('1990-01-01T12:00:00.000Z');
    expect(ascendant(date,sample.latitude,sample.longitude)).toBeCloseTo(2.9011,1);
    expect(midheaven(date,sample.longitude)).toBeCloseTo(271.5939,1);
    const chart=calculateChart({...sample,houseSystem:'PLACIDUS'});
    const expected=[2.9011,42.8175,69.5662,91.5939,113.869,141.5106,182.9011,222.8175,249.5662,271.5939,293.869,321.5106];
    chart.houses.forEach((house,index)=>expect(house.longitude).toBeCloseTo(expected[index],1));
    expect(chart.settings.houseAccuracy).toBe('Exact');
  });
  it('keeps displayed degree/minute values normalized after rounding',()=>{
    const position=astroInternals.position('Sun',29.9999);
    expect(position.sign).toBe('Taurus');
    expect(position.degree).toBe(0);
    expect(position.minute).toBe(0);
  });
  it('uses one day after birth for a one-year secondary progression',()=>{
    const target=new Date('1991-01-01T12:00:00Z');
    const chart=calculateChart(sample,'PROGRESSION',target);
    expect(new Date(chart.chartDate).getUTCDate()).toBe(2);
    expect(new Date(chart.chartDate).getUTCFullYear()).toBe(1990);
  });
  it('keeps natal aspects available on a transit bi-wheel',()=>{
    const chart=calculateChart(sample,'TRANSIT',new Date('2026-07-18T00:00:00Z'));
    expect(chart.natalAspects.length).toBeGreaterThan(0);
    expect(chart.aspects.some(aspect=>chart.planets.some(planet=>planet.name===aspect.from))).toBe(true);
  });
  it('caps long ephemeris output safely',()=>{
    const rows=ephemeris(new Date('2025-01-01'),new Date('2030-01-01'));
    expect(rows.length).toBe(1101);
  });
  it('returns forecast contacts with valid orbs',()=>{
    const events=forecast(sample,new Date('2026-01-01'),new Date('2026-04-01'),3);
    expect(events.every(e=>Number(e.orb)<=1.2)).toBe(true);
  });
  it('builds transit intervals with strength, houses and pass metadata',()=>{
    const events=transitReport(sample,new Date('2026-01-01'),new Date('2026-03-01'),{scope:'SLOW',orb:3});
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event=>Number(event.peakOrb)<=3)).toBe(true);
    expect(events.every(event=>Number(event.strength)>=0&&Number(event.strength)<=100)).toBe(true);
    expect(events.every(event=>Number(event.natalHouse)>=1&&Number(event.natalHouse)<=12)).toBe(true);
    expect(events.every(event=>Array.isArray(event.exactHits))).toBe(true);
    expect(events.every(event=>String(event.interpretation).length>80)).toBe(true);
  });
  it('calculates paired-chart aspects and a bounded synastry balance',()=>{
    const result=calculateSynastry(sample,{...sample,name:'Second',birthDate:'1992-05-10',birthTime:'18:30'});
    expect(result.chart.mode).toBe('SYNASTRY');
    expect(result.chart.aspects.length).toBeGreaterThan(0);
    expect(result.summary.score).toBeGreaterThanOrEqual(10);
    expect(result.summary.score).toBeLessThanOrEqual(90);
    expect(result.highlights[0].interpretation).toContain('Second');
  });
  it('generates Portuguese transit and synastry report language',()=>{
    const transits=transitReport(sample,new Date('2026-01-01'),new Date('2026-03-01'),{scope:'SLOW',orb:3,language:'pt-PT'});
    expect(String(transits[0].interpretation)).toContain('Considere as datas');
    const relationship=calculateSynastry(sample,{...sample,name:'Segunda Pessoa',birthDate:'1992-05-10',birthTime:'18:30'},'pt-PT');
    expect(relationship.highlights[0].interpretation).toContain('Este contacto');
  });
  it('projects four angular astrocartography lines per planet',()=>{
    const map=astrocartography(sample);
    expect(map.lines).toHaveLength(40);
    expect(new Set(map.lines.map(line=>line.angle))).toEqual(new Set(['ASC','DSC','MC','IC']));
    expect(map.lines.every(line=>line.points.every(point=>point.longitude>=-180&&point.longitude<=180))).toBe(true);
  });
});
