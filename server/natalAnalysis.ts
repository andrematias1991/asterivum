import { calculateChart, SIGNS } from './astro.js';
import type { BirthData } from './types.js';

type Language = 'en' | 'pt-PT';
type Chart = ReturnType<typeof calculateChart>;
type NatalAspect = {from:string;to:string;type:string;glyph:string;angle:number;orb:number;applying:null};

const normalize = (value:number) => ((value % 360) + 360) % 360;
const distance = (a:number,b:number) => Math.abs(((a-b+540)%360)-180);

const signMeta:Record<string,{element:string;modality:string;polarity:string}> = {
  Aries:{element:'Fire',modality:'Cardinal',polarity:'Active'}, Taurus:{element:'Earth',modality:'Fixed',polarity:'Receptive'},
  Gemini:{element:'Air',modality:'Mutable',polarity:'Active'}, Cancer:{element:'Water',modality:'Cardinal',polarity:'Receptive'},
  Leo:{element:'Fire',modality:'Fixed',polarity:'Active'}, Virgo:{element:'Earth',modality:'Mutable',polarity:'Receptive'},
  Libra:{element:'Air',modality:'Cardinal',polarity:'Active'}, Scorpio:{element:'Water',modality:'Fixed',polarity:'Receptive'},
  Sagittarius:{element:'Fire',modality:'Mutable',polarity:'Active'}, Capricorn:{element:'Earth',modality:'Cardinal',polarity:'Receptive'},
  Aquarius:{element:'Air',modality:'Fixed',polarity:'Active'}, Pisces:{element:'Water',modality:'Mutable',polarity:'Receptive'},
};

const traditionalRulers:Record<string,string> = {
  Aries:'Mars', Taurus:'Venus', Gemini:'Mercury', Cancer:'Moon', Leo:'Sun', Virgo:'Mercury',
  Libra:'Venus', Scorpio:'Mars', Sagittarius:'Jupiter', Capricorn:'Saturn', Aquarius:'Saturn', Pisces:'Jupiter',
};
const modernCoRulers:Record<string,string|undefined> = { Scorpio:'Pluto', Aquarius:'Uranus', Pisces:'Neptune' };
const ptLabels:Record<string,string> = {
  Sun:'Sol',Moon:'Lua',Mercury:'Mercúrio',Venus:'Vénus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno',Uranus:'Urano',Neptune:'Neptuno',Pluto:'Plutão',Node:'Nodo',
  Aries:'Carneiro',Taurus:'Touro',Gemini:'Gémeos',Cancer:'Caranguejo',Leo:'Leão',Virgo:'Virgem',Libra:'Balança',Scorpio:'Escorpião',Sagittarius:'Sagitário',Capricorn:'Capricórnio',Aquarius:'Aquário',Pisces:'Peixes',
  Conjunction:'Conjunção',Sextile:'Sextil',Square:'Quadratura',Trine:'Trígono',Opposition:'Oposição',
  'New Moon':'Lua Nova',Crescent:'Crescente','First Quarter':'Quarto Crescente',Gibbous:'Gibosa','Full Moon':'Lua Cheia',Disseminating:'Disseminante','Last Quarter':'Quarto Minguante',Balsamic:'Balsâmica',
  Domicile:'Domicílio',Detriment:'Exílio',Exaltation:'Exaltação',Fall:'Queda',Neutral:'Neutro',Fire:'Fogo',Earth:'Terra',Air:'Ar',Water:'Água',
};
const localized=(value:string,language:Language)=>language==='pt-PT'?(ptLabels[value]||value):value;

const dignities:Record<string,{domicile:string[];detriment:string[];exaltation:string[];fall:string[]}> = {
  Sun:{domicile:['Leo'],detriment:['Aquarius'],exaltation:['Aries'],fall:['Libra']},
  Moon:{domicile:['Cancer'],detriment:['Capricorn'],exaltation:['Taurus'],fall:['Scorpio']},
  Mercury:{domicile:['Gemini','Virgo'],detriment:['Sagittarius','Pisces'],exaltation:['Virgo'],fall:['Pisces']},
  Venus:{domicile:['Taurus','Libra'],detriment:['Scorpio','Aries'],exaltation:['Pisces'],fall:['Virgo']},
  Mars:{domicile:['Aries','Scorpio'],detriment:['Libra','Taurus'],exaltation:['Capricorn'],fall:['Cancer']},
  Jupiter:{domicile:['Sagittarius','Pisces'],detriment:['Gemini','Virgo'],exaltation:['Cancer'],fall:['Capricorn']},
  Saturn:{domicile:['Capricorn','Aquarius'],detriment:['Cancer','Leo'],exaltation:['Libra'],fall:['Aries']},
};
const modernDomiciles:Record<string,{domicile:string;detriment:string}> = {
  Uranus:{domicile:'Aquarius',detriment:'Leo'}, Neptune:{domicile:'Pisces',detriment:'Virgo'}, Pluto:{domicile:'Scorpio',detriment:'Taurus'},
};

function position(longitude:number) {
  const normalized=normalize(longitude);
  const minutes=Math.round(normalized*60)%(360*60);
  const signIndex=Math.floor(minutes/1800), signMinutes=minutes%1800;
  return { longitude:normalized,sign:SIGNS[signIndex],degree:Math.floor(signMinutes/60),minute:signMinutes%60 };
}

function houseFor(longitude:number,houses:Chart['houses']) {
  for (let index=0;index<houses.length;index+=1) {
    const start=houses[index].longitude, next=houses[(index+1)%houses.length].longitude;
    if (normalize(longitude-start)<normalize(next-start)) return houses[index].number;
  }
  return 1;
}

function dignityFor(name:string,sign:string) {
  const rules=dignities[name];
  if (rules) {
    if (rules.domicile.includes(sign)) return {status:'Domicile',disputed:false};
    if (rules.detriment.includes(sign)) return {status:'Detriment',disputed:false};
    if (rules.exaltation.includes(sign)) return {status:'Exaltation',disputed:false};
    if (rules.fall.includes(sign)) return {status:'Fall',disputed:false};
    return {status:'Neutral',disputed:false};
  }
  const modern=modernDomiciles[name];
  if (modern?.domicile===sign) return {status:'Modern domicile',disputed:true};
  if (modern?.detriment===sign) return {status:'Modern detriment',disputed:true};
  return {status:'Neutral',disputed:Boolean(modern)};
}

function distribution(values:string[],categories:string[]) {
  const counts=Object.fromEntries(categories.map(category=>[category,values.filter(value=>value===category).length]));
  const high=Math.max(...Object.values(counts)), low=Math.min(...Object.values(counts));
  return {
    counts,
    dominant:high>0?categories.filter(category=>counts[category]===high):[],
    deficient:categories.filter(category=>counts[category]===low),
    total:values.length,
  };
}

function placementText(name:string,sign:string,house:number,language:Language) {
  return language==='pt-PT' ? `${localized(name,language)} em ${localized(sign,language)}, casa ${house}` : `${name} in ${sign}, house ${house}`;
}

export function calculateNatalAnalysis(data:BirthData,language:Language='en') {
  const chart=calculateChart(data);
  const natalAspects=chart.aspects as NatalAspect[];
  const planets=chart.natal.map(planet=>({
    ...planet,
    house:houseFor(planet.longitude,chart.houses),
    ...signMeta[planet.sign],
    dignity:dignityFor(planet.name,planet.sign),
  }));
  const counted=planets.filter(planet=>planet.name!=='Node');
  const elements=distribution(counted.map(planet=>planet.element),['Fire','Earth','Air','Water']);
  const modalities=distribution(counted.map(planet=>planet.modality),['Cardinal','Fixed','Mutable']);
  const polarities=distribution(counted.map(planet=>planet.polarity),['Active','Receptive']);
  const above=counted.filter(planet=>planet.house>=7).length, below=counted.length-above;
  const eastern=counted.filter(planet=>[10,11,12,1,2,3].includes(planet.house)).length, western=counted.length-eastern;
  const quadrants=[1,2,3,4].map(number=>({number,count:counted.filter(planet=>Math.ceil(planet.house/3)===number).length}));

  const signatureElement=elements.dominant.length===1?elements.dominant[0]:null;
  const signatureModality=modalities.dominant.length===1?modalities.dominant[0]:null;
  const signatureSign=signatureElement&&signatureModality
    ? Object.entries(signMeta).find(([,meta])=>meta.element===signatureElement&&meta.modality===signatureModality)?.[0]||null
    : null;

  const asc=position(chart.angles.ascendant.longitude), mc=position(chart.angles.midheaven.longitude);
  const angleValues=[
    {name:'Ascendant',...asc}, {name:'Descendant',...position(asc.longitude+180)},
    {name:'Midheaven',...mc}, {name:'IC',...position(mc.longitude+180)},
  ].map(angle=>({
    ...angle,
    ruler:traditionalRulers[angle.sign],
    modernCoRuler:modernCoRulers[angle.sign]||null,
    nearbyPlanets:planets.filter(planet=>distance(planet.longitude,angle.longitude)<=5).map(planet=>({name:planet.name,distance:Number(distance(planet.longitude,angle.longitude).toFixed(2))})),
  }));
  const angleByName=Object.fromEntries(angleValues.map(angle=>[angle.name,angle]));

  const houseRulers=chart.houses.map(house=>({house:house.number,sign:house.sign,ruler:traditionalRulers[house.sign],modernCoRuler:modernCoRulers[house.sign]||null}));
  const chartRulerName=traditionalRulers[asc.sign];
  const chartRuler=planets.find(planet=>planet.name===chartRulerName)!;

  const north=planets.find(planet=>planet.name==='Node')!;
  const southPosition=position(north.longitude+180);
  const south={name:'South Node',...southPosition,house:houseFor(southPosition.longitude,chart.houses),ruler:traditionalRulers[southPosition.sign],modernCoRuler:modernCoRulers[southPosition.sign]||null};
  const northNode={...north,name:'North Node',ruler:traditionalRulers[north.sign],modernCoRuler:modernCoRulers[north.sign]||null};

  const sun=planets.find(planet=>planet.name==='Sun')!, moon=planets.find(planet=>planet.name==='Moon')!;
  const elongation=normalize(moon.longitude-sun.longitude);
  const phaseNames=['New Moon','Crescent','First Quarter','Gibbous','Full Moon','Disseminating','Last Quarter','Balsamic'];
  const phaseIndex=Math.floor(normalize(elongation+22.5)/45)%8;
  const lunation={phase:phaseNames[phaseIndex],elongation:Number(elongation.toFixed(2)),waxing:elongation>0&&elongation<180};

  const luminaries=new Set(['Sun','Moon']);
  const personal=new Set(['Mercury','Venus','Mars']);
  const significantAspects=natalAspects.map(aspect=>{
    let score=Math.max(0,60-aspect.orb*7);
    if (luminaries.has(String(aspect.from))) score+=14;
    if (luminaries.has(String(aspect.to))) score+=14;
    if (personal.has(String(aspect.from))) score+=6;
    if (personal.has(String(aspect.to))) score+=6;
    if ([aspect.from,aspect.to].includes(chartRulerName)) score+=10;
    if ([aspect.from,aspect.to].includes('Node')) score+=5;
    return {...aspect,significance:Math.min(100,Math.round(score))};
  }).sort((a,b)=>b.significance-a.significance||a.orb-b.orb);

  const aspectBetween=(first:string,second:string)=>natalAspects.find(aspect=>(aspect.from===first&&aspect.to===second)||(aspect.from===second&&aspect.to===first));
  const marsPluto=aspectBetween('Mars','Pluto'), sunMoon=aspectBetween('Sun','Moon');
  const ic=angleByName.IC, midheaven=angleByName.Midheaven;
  const icOccupants=counted.filter(planet=>planet.house===4).map(planet=>planet.name);
  const mcOccupants=counted.filter(planet=>planet.house===10).map(planet=>planet.name);
  const waterPlanets=counted.filter(planet=>planet.element==='Water'||[4,8,12].includes(planet.house));

  const sections={
    origins:[
      {key:'south-node',title:language==='pt-PT'?'Nodo Sul':'South Node',summary:placementText(language==='pt-PT'?'Nodo Sul':'South Node',south.sign,south.house,language),evidence:[`${language==='pt-PT'?'Regente':'Ruler'}: ${localized(south.ruler,language)}`]},
      {key:'saturn',title:language==='pt-PT'?'Saturno':'Saturn',summary:placementText('Saturn',planets.find(p=>p.name==='Saturn')!.sign,planets.find(p=>p.name==='Saturn')!.house,language),evidence:significantAspects.filter(a=>a.from==='Saturn'||a.to==='Saturn').slice(0,3).map(a=>`${localized(a.from,language)} ${localized(a.type,language).toLowerCase()} ${localized(a.to,language)}`)},
      {key:'moon',title:language==='pt-PT'?'Lua':'Moon',summary:placementText('Moon',moon.sign,moon.house,language),evidence:significantAspects.filter(a=>a.from==='Moon'||a.to==='Moon').slice(0,3).map(a=>`${localized(a.from,language)} ${localized(a.type,language).toLowerCase()} ${localized(a.to,language)}`)},
      {key:'ic',title:language==='pt-PT'?'Fundo do Céu (IC)':'Imum Coeli (IC)',summary:`${ic.degree}°${String(ic.minute).padStart(2,'0')}′ ${localized(ic.sign,language)}`,evidence:[`${language==='pt-PT'?'Regente':'Ruler'}: ${localized(ic.ruler,language)}`,...icOccupants.map(name=>`${localized(name,language)} · ${language==='pt-PT'?'casa 4':'house 4'}`)]},
      {key:'water',title:language==='pt-PT'?'Água e mundo emocional':'Water emphasis',summary:language==='pt-PT'?`${waterPlanets.length} posicionamentos em signos ou casas de Água`:`${waterPlanets.length} placements in Water signs or houses`,evidence:waterPlanets.map(p=>placementText(p.name,p.sign,p.house,language))},
      {key:'mars-pluto',title:language==='pt-PT'?'Dinâmica Marte–Plutão':'Mars–Pluto dynamic',summary:marsPluto?`${marsPluto.type} · ${marsPluto.orb.toFixed(2)}° ${language==='pt-PT'?'de orbe':'orb'}`:(language==='pt-PT'?'Sem aspeto maior; analisar posições separadamente':'No major aspect; consider the placements separately'),evidence:[placementText('Mars',planets.find(p=>p.name==='Mars')!.sign,planets.find(p=>p.name==='Mars')!.house,language),placementText('Pluto',planets.find(p=>p.name==='Pluto')!.sign,planets.find(p=>p.name==='Pluto')!.house,language)]},
    ],
    direction:[
      {key:'north-node',title:language==='pt-PT'?'Nodo Norte':'North Node',summary:placementText(language==='pt-PT'?'Nodo Norte':'North Node',northNode.sign,northNode.house,language),evidence:[`${language==='pt-PT'?'Regente':'Ruler'}: ${localized(northNode.ruler,language)}`]},
      {key:'mc',title:language==='pt-PT'?'Meio do Céu (MC)':'Midheaven (MC)',summary:`${midheaven.degree}°${String(midheaven.minute).padStart(2,'0')}′ ${localized(midheaven.sign,language)}`,evidence:[`${language==='pt-PT'?'Regente':'Ruler'}: ${localized(midheaven.ruler,language)}`,...mcOccupants.map(name=>`${localized(name,language)} · ${language==='pt-PT'?'casa 10':'house 10'}`)]},
      {key:'sun-moon',title:language==='pt-PT'?'Dinâmica Sol–Lua':'Sun–Moon dynamic',summary:`${localized(lunation.phase,language)} · ${lunation.elongation.toFixed(2)}°`,evidence:sunMoon?[`${localized(sunMoon.type,language)} · ${sunMoon.orb.toFixed(2)}°`]:[language==='pt-PT'?'Sem aspeto maior dentro da orbe selecionada':'No major aspect within the selected orb']},
      {key:'personal',title:language==='pt-PT'?'Planetas pessoais':'Personal planets',summary:language==='pt-PT'?'Pensamento, valores, desejo e afirmação':'Mind, values, desire and assertion',evidence:planets.filter(p=>['Mercury','Venus','Mars'].includes(p.name)).map(p=>placementText(p.name,p.sign,p.house,language))},
      {key:'social',title:language==='pt-PT'?'Planetas sociais':'Social planets',summary:language==='pt-PT'?'Expansão, estrutura e integração social':'Growth, structure and social integration',evidence:planets.filter(p=>['Jupiter','Saturn'].includes(p.name)).map(p=>placementText(p.name,p.sign,p.house,language))},
      {key:'transpersonal',title:language==='pt-PT'?'Planetas transpessoais':'Transpersonal planets',summary:language==='pt-PT'?'Mudança coletiva e transformação profunda':'Collective change and deep transformation',evidence:planets.filter(p=>['Uranus','Neptune','Pluto'].includes(p.name)).map(p=>placementText(p.name,p.sign,p.house,language))},
    ],
  };

  const strengthened=planets.filter(p=>['Domicile','Exaltation'].includes(p.dignity.status));
  const challenged=planets.filter(p=>['Detriment','Fall'].includes(p.dignity.status));
  const synthesis={
    resources:language==='pt-PT'
      ? `O regente do mapa, ${localized(chartRuler.name,language)}, está em ${localized(chartRuler.sign,language)} na casa ${chartRuler.house}.${strengthened.length?` Funções fortalecidas: ${strengthened.map(p=>localized(p.name,language)).join(', ')}.`:''}`
      : `The chart ruler, ${chartRuler.name}, is in ${chartRuler.sign} in house ${chartRuler.house}.${strengthened.length?` Strengthened functions: ${strengthened.map(p=>p.name).join(', ')}.`:''}`,
    patterns:language==='pt-PT'?`O Nodo Sul em ${localized(south.sign,language)} na casa ${south.house}, a Lua na casa ${moon.house} e Saturno na casa ${planets.find(p=>p.name==='Saturn')!.house} formam o eixo principal para explorar padrões recorrentes.`:`The South Node in ${south.sign} in house ${south.house}, Moon in house ${moon.house}, and Saturn in house ${planets.find(p=>p.name==='Saturn')!.house} form the main axis for exploring recurring patterns.`,
    challenges:language==='pt-PT'?`${challenged.length?`Dignidades exigentes: ${challenged.map(p=>`${localized(p.name,language)} (${localized(p.dignity.status,language)})`).join(', ')}. `:''}Os elementos menos representados são ${elements.deficient.map(item=>localized(item,language)).join(', ')}; isto indica áreas a desenvolver, não uma ausência absoluta.`:`${challenged.length?`Demanding dignities: ${challenged.map(p=>`${p.name} (${p.dignity.status})`).join(', ')}. `:''}The least represented elements are ${elements.deficient.join(', ')}; these are development areas, not absolute absences.`,
    skills:language==='pt-PT'?`O Nodo Norte em ${localized(northNode.sign,language)} na casa ${northNode.house} convida ao desenvolvimento das qualidades desse signo e dessa área de vida.`:`The North Node in ${northNode.sign} in house ${northNode.house} invites development through that sign's qualities and life area.`,
    direction:language==='pt-PT'?`O MC em ${localized(midheaven.sign,language)}, regido por ${localized(midheaven.ruler,language)}, liga a direção pública do mapa ao Nodo Norte e ao regente do mapa.`:`The MC in ${midheaven.sign}, ruled by ${midheaven.ruler}, connects public direction with the North Node and chart ruler.`,
  };

  return {
    chart,
    methodology:language==='pt-PT'
      ? {dominanceBodies:'Dez planetas; nodos e ângulos são apresentados separadamente',rulership:'Regente tradicional com corregente moderno assinalado',node:'Nodo lunar médio',dignities:'Dignidade essencial tradicional; associações dos planetas exteriores assinaladas como discutidas',angularOrb:5}
      : {dominanceBodies:'Ten planets; nodes and angles are shown separately',rulership:'Traditional ruler with modern co-ruler noted',node:'Mean lunar node',dignities:'Traditional essential dignity; outer-planet associations marked disputed',angularOrb:5},
    planets,elements,modalities,polarities,
    hemispheres:{above,below,eastern,western},quadrants,
    signature:{element:signatureElement,modality:signatureModality,sign:signatureSign,ambiguous:!signatureSign},
    angles:angleValues,houseRulers,
    chartRuler:{name:chartRulerName,modernCoRuler:modernCoRulers[asc.sign]||null,placement:chartRuler},
    nodes:{north:northNode,south},lunation,significantAspects,sections,synthesis,
  };
}
