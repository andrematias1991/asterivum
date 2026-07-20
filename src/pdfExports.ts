import { jsPDF } from "jspdf";
import type { Chart, NatalAnalysis, Profile, TransitReportEvent } from "./types";

const safeName = (value:string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asterivum";
const isPortuguese = () => localStorage.getItem('asterivum_language') === 'pt-PT';
const text = (english:string, portuguese:string) => isPortuguese() ? portuguese : english;
const astrologyPt:Record<string,string>={Sun:'Sol',Moon:'Lua',Mercury:'Mercúrio',Venus:'Vénus',Mars:'Marte',Jupiter:'Júpiter',Saturn:'Saturno',Uranus:'Urano',Neptune:'Neptuno',Pluto:'Plutão',Node:'Nodo Norte',Ascendant:'Ascendente',Descendant:'Descendente',Midheaven:'Meio do Céu',IC:'Fundo do Céu',Aries:'Carneiro',Taurus:'Touro',Gemini:'Gémeos',Cancer:'Caranguejo',Leo:'Leão',Virgo:'Virgem',Libra:'Balança',Scorpio:'Escorpião',Sagittarius:'Sagitário',Capricorn:'Capricórnio',Aquarius:'Aquário',Pisces:'Peixes',Fire:'Fogo',Earth:'Terra',Air:'Ar',Water:'Água',Cardinal:'Cardinal',Fixed:'Fixa',Mutable:'Mutável',Active:'Ativa',Receptive:'Recetiva',Conjunction:'Conjunção',Sextile:'Sextil',Square:'Quadratura',Trine:'Trígono',Opposition:'Oposição','New Moon':'Lua Nova',Crescent:'Crescente','First Quarter':'Quarto Crescente',Gibbous:'Gibosa','Full Moon':'Lua Cheia',Disseminating:'Disseminante','Last Quarter':'Quarto Minguante',Balsamic:'Balsâmica','Modern domicile':'Domicílio moderno','Modern detriment':'Exílio moderno'};
const astrologyText=(value:string)=>isPortuguese()?(astrologyPt[value]||value):value;
const dateText = (value:string) => new Date(value).toLocaleDateString(isPortuguese()?'pt-PT':'en-GB', { day:"2-digit", month:"short", year:"numeric" });
const pageWidth = 297;
const pageHeight = 210;

function header(doc:jsPDF, title:string, subtitle:string) {
  const width=doc.internal.pageSize.getWidth();
  doc.setFillColor(31, 24, 37);
  doc.rect(0, 0, width, 25, "F");
  doc.setTextColor(224, 199, 134);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ASTERIVUM ASTROLOGY", 12, 10);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.text(title, 12, 19);
  doc.setTextColor(70, 64, 72);
  doc.setFontSize(8);
  doc.text(subtitle, 12, 31);
}

function footer(doc:jsPDF, page:number, total:number) {
  const width=doc.internal.pageSize.getWidth(), height=doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 213, 203);
  doc.line(12, height - 10, width - 12, height - 10);
  doc.setTextColor(125, 117, 127);
  doc.setFontSize(7);
  doc.text(`Asterivum Astrology - ${text('Page','Página')} ${page} ${text('of','de')} ${total}`, width - 12, height - 6, { align:"right" });
}

async function svgImage(svg:SVGSVGElement) {
  const clone=svg.cloneNode(true) as SVGSVGElement;
  const originals=[svg,...Array.from(svg.querySelectorAll("*"))];
  const copies=[clone,...Array.from(clone.querySelectorAll("*"))];
  const properties=["fill","stroke","stroke-width","stroke-dasharray","opacity","font-family","font-size","font-weight","text-anchor","dominant-baseline"];
  originals.forEach((element,index)=>{
    const computed=getComputedStyle(element);
    properties.forEach(property=>{ const value=computed.getPropertyValue(property); if(value) (copies[index] as SVGElement).style.setProperty(property,value); });
  });
  clone.setAttribute("width","1680"); clone.setAttribute("height","1680");
  const source=new XMLSerializer().serializeToString(clone);
  const url=URL.createObjectURL(new Blob([source],{type:"image/svg+xml;charset=utf-8"}));
  try {
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{ const value=new Image(); value.onload=()=>resolve(value); value.onerror=reject; value.src=url; });
    const canvas=document.createElement("canvas"); canvas.width=1680; canvas.height=1680;
    const context=canvas.getContext("2d")!; context.fillStyle="#fffdf8"; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/png",1);
  } finally { URL.revokeObjectURL(url); }
}

export async function exportChartPdf(profile:Profile, chart:Chart, svg:SVGSVGElement) {
  const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4", compress:true });
  const mode = chart.mode === "NATAL" ? text("Natal chart","Mapa natal") : chart.mode === 'TRANSIT' ? text('Transit chart','Mapa de trânsitos') : text('Progression chart','Mapa de progressões');
  header(doc, `${profile.name} - ${mode}`, `${profile.birthDate} at ${profile.birthTime} - ${profile.place} - ${profile.zodiac} - ${profile.houseSystem.replace("_", " ")}`);
  doc.addImage(await svgImage(svg),"PNG",10,36,162,162,undefined,"FAST");

  let y = 42;
  doc.setTextColor(44, 38, 47);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text("Celestial positions","Posições celestes"), 180, y);
  y += 7;
  doc.setFontSize(7.5);
  chart.planets.forEach(planet => {
    doc.setFont("helvetica", "bold");
    doc.text(planet.name, 180, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${planet.degree} deg ${String(planet.minute).padStart(2,"0")} min ${planet.sign}${planet.retrograde ? " R" : ""}`, 207, y);
    y += 5.2;
  });
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text(text("Ascendant","Ascendente"), 180, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${chart.angles.ascendant.degree} deg ${chart.angles.ascendant.minute} min ${chart.angles.ascendant.sign}`, 207, y);
  y += 5.2;
  doc.setFont("helvetica", "bold");
  doc.text(text("Midheaven","Meio do Céu"), 180, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${chart.angles.midheaven.degree} deg ${chart.angles.midheaven.minute} min ${chart.angles.midheaven.sign}`, 207, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text("Strongest aspects","Aspetos mais fortes"), 180, y);
  y += 7;
  doc.setFontSize(7.2);
  chart.aspects.slice(0, 14).forEach(aspect => {
    doc.setFont("helvetica", "bold");
    doc.text(`${aspect.from} ${aspect.type.toLowerCase()} ${aspect.to}`, 180, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${aspect.orb.toFixed(2)} deg ${text('orb','orbe')}`, 273, y, { align:"right" });
    y += 5;
  });
  footer(doc, 1, 1);
  doc.setProperties({ title:`${profile.name} - ${mode}`, subject:"Astrology chart", author:"Asterivum Astrology", creator:"Asterivum Astrology" });
  doc.save(`${safeName(profile.name)}-${chart.mode.toLowerCase()}-chart.pdf`);
}

export function exportTransitPdf(profile:Profile, events:TransitReportEvent[], period:{start:string;end:string}, scope:string, orb:number) {
  const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4", compress:true });
  const subtitle = `${dateText(period.start)} - ${dateText(period.end)} - ${scope === "SLOW" ? text("Slow planets","Planetas lentos") : text("All planets","Todos os planetas")} - ${orb} deg ${text('orb','orbe')}`;
  let page = 1;
  let y = 41;
  const newPage = () => { doc.addPage(); page += 1; header(doc, `${profile.name} - ${text('Transit report','Relatório de trânsitos')}`, subtitle); y = 41; };
  header(doc, `${profile.name} - ${text('Transit report','Relatório de trânsitos')}`, subtitle);

  events.forEach(event => {
    const interpretationLines = doc.splitTextToSize(event.interpretation || "", 245) as string[];
    const needed = 25 + interpretationLines.length * 3.8 + event.exactHits.length * 4;
    if (y + needed > pageHeight - 14) newPage();
    doc.setDrawColor(224, 216, 207);
    doc.line(12, y - 4, pageWidth - 12, y - 4);
    doc.setTextColor(46, 39, 48);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${event.transitPlanet} ${event.aspect.toLowerCase()} natal ${event.natalPlanet}`, 12, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`${event.strengthLabel} (${event.strength}%) - closest orb ${event.peakOrb.toFixed(2)} deg`, pageWidth - 12, y, { align:"right" });
    y += 5;
    doc.setTextColor(104, 95, 106);
    doc.text(`${dateText(event.startDate)} - ${dateText(event.endDate)} | ${event.transitSign}, ${text('natal house','casa natal')} ${event.natalHouse}`, 12, y);
    y += 5;
    if (event.exactHits.length) {
      doc.setTextColor(92, 58, 77);
      doc.text(event.exactHits.map((hit,index) => `${text('Pass','Passagem')} ${index+1}: ${dateText(hit.date)} (${hit.retrograde ? text("retrograde","retrógrado") : text("direct","direto")})`).join("   "), 12, y);
      y += 5;
    }
    doc.setTextColor(70, 64, 72);
    doc.setFontSize(7);
    interpretationLines.forEach(line => { doc.text(line, 12, y); y += 3.8; });
    y += 5;
  });
  const total = page;
  for (let index = 1; index <= total; index++) { doc.setPage(index); footer(doc, index, total); }
  doc.setProperties({ title:`${profile.name} - Transit report`, subject:"Astrology transit report", author:"Asterivum Astrology", creator:"Asterivum Astrology" });
  doc.save(`${safeName(profile.name)}-transit-report.pdf`);
}

export function exportNatalAnalysisPdf(profile:Profile, analysis:NatalAnalysis) {
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const width=210,height=297,margin=14,contentWidth=width-margin*2;
  const subtitle=`${profile.birthDate} - ${profile.birthTime} - ${profile.place} - ${profile.houseSystem.replace('_',' ')}`;
  const title=`${profile.name} - ${text('Natal Technical Dossier','Dossiê Técnico Natal')}`;
  let page=1,y=39;
  const newPage=()=>{doc.addPage();page+=1;header(doc,title,subtitle);y=39;};
  const section=(label:string)=>{if(y>height-25)newPage();doc.setTextColor(95,57,77);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(label,margin,y);y+=7;};
  const line=(label:string,value:string)=>{if(y>height-17)newPage();doc.setFontSize(8);doc.setTextColor(55,49,57);doc.setFont('helvetica','bold');doc.text(label,margin,y);doc.setFont('helvetica','normal');doc.text(value,58,y);y+=5;};
  const paragraph=(label:string,value:string)=>{
    if(y>height-35)newPage();
    doc.setTextColor(65,57,67);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(label,margin,y);y+=5;
    doc.setFont('helvetica','normal');doc.setFontSize(7.5);
    const lines=doc.splitTextToSize(value,contentWidth) as string[];
    lines.forEach(valueLine=>{if(y>height-17)newPage();doc.text(valueLine,margin,y);y+=4;});y+=3;
  };
  const dignityLabel=(status:string)=>text(status,status==='Domicile'?'Domicílio':status==='Detriment'?'Exílio':status==='Exaltation'?'Exaltação':status==='Fall'?'Queda':status==='Neutral'?'Neutro':astrologyText(status));
  header(doc,title,subtitle);

  section(text('Core identification','Identificação principal'));
  line(text('Chart signature','Assinatura do mapa'),analysis.signature.sign?astrologyText(analysis.signature.sign):text('Mixed','Mista'));
  line(text('Chart ruler','Regente do mapa'),`${astrologyText(analysis.chartRuler.name)} - ${astrologyText(analysis.chartRuler.placement.sign)} - ${text('house','casa')} ${analysis.chartRuler.placement.house}`);
  line(text('Lunation phase','Fase de lunação'),`${astrologyText(analysis.lunation.phase)} - ${analysis.lunation.elongation.toFixed(2)} ${text('deg','graus')}`);
  line(text('Dominant elements','Elementos dominantes'),analysis.elements.dominant.map(astrologyText).join(', '));
  line(text('Dominant modalities','Modalidades dominantes'),analysis.modalities.dominant.map(astrologyText).join(', '));
  line(text('Least represented','Menos representado'),analysis.elements.deficient.map(astrologyText).join(', '));
  y+=3;section(text('Planet - Sign - House','Planeta - Signo - Casa'));
  doc.setFontSize(7.2);
  analysis.planets.forEach(planet=>{
    if(y>height-18)newPage();
    doc.setFont('helvetica','bold');doc.setTextColor(47,40,49);doc.text(astrologyText(planet.name),margin,y);
    doc.setFont('helvetica','normal');doc.text(`${planet.degree}° ${String(planet.minute).padStart(2,'0')} min ${astrologyText(planet.sign)}`,55,y);doc.text(`${text('House','Casa')} ${planet.house}`,112,y);doc.text(dignityLabel(planet.dignity.status),150,y);y+=5;
  });

  newPage();section(text('Chart structure','Estrutura do mapa'));
  line(text('Elements','Elementos'),Object.entries(analysis.elements.counts).map(([name,count])=>`${astrologyText(name)} ${count}`).join('  ·  '));
  line(text('Modalities','Modalidades'),Object.entries(analysis.modalities.counts).map(([name,count])=>`${astrologyText(name)} ${count}`).join('  ·  '));
  line(text('Polarity','Polaridade'),Object.entries(analysis.polarities.counts).map(([name,count])=>`${astrologyText(name)} ${count}`).join('  ·  '));
  line(text('Horizon','Horizonte'),`${text('Above','Acima')} ${analysis.hemispheres.above}  ·  ${text('Below','Abaixo')} ${analysis.hemispheres.below}`);
  line(text('Hemispheres','Hemisférios'),`${text('Eastern','Oriental')} ${analysis.hemispheres.eastern}  ·  ${text('Western','Ocidental')} ${analysis.hemispheres.western}`);
  line(text('Quadrants','Quadrantes'),analysis.quadrants.map(item=>`${item.number}: ${item.count}`).join('  ·  '));
  y+=3;section(text('Angles and rulers','Ângulos e regentes'));
  analysis.angles.forEach(angle=>line(astrologyText(angle.name),`${angle.degree}° ${String(angle.minute).padStart(2,'0')} min ${astrologyText(angle.sign)}  ·  ${text('Ruler','Regente')}: ${astrologyText(angle.ruler)}${angle.modernCoRuler?` + ${astrologyText(angle.modernCoRuler)}`:''}`));
  y+=3;section(text('House rulers','Regentes das casas'));
  analysis.houseRulers.forEach(item=>line(`${text('House','Casa')} ${item.house}`,`${astrologyText(item.sign)}  ·  ${astrologyText(item.ruler)}${item.modernCoRuler?` + ${astrologyText(item.modernCoRuler)}`:''}`));

  newPage();section(text('Significant aspects','Aspetos significativos'));
  analysis.significantAspects.slice(0,12).forEach(aspect=>line(`${astrologyText(aspect.from)} ${astrologyText(aspect.type).toLowerCase()} ${astrologyText(aspect.to)}`,`${aspect.orb.toFixed(2)}° ${text('orb','orbe')} - ${aspect.significance}/100`));
  y+=4;section(text('Calculation notes','Notas de cálculo'));
  paragraph(text('Methodology','Metodologia'),`${analysis.methodology.dominanceBodies}. ${analysis.methodology.rulership}. ${analysis.methodology.node}. ${analysis.methodology.dignities}.`);
  paragraph(text('Scope','Âmbito'),text('This dossier contains calculated chart factors and no automated personal interpretation. The astrologer remains responsible for synthesis and consultation context.','Este dossiê contém fatores calculados do mapa e não inclui interpretação pessoal automatizada. O astrólogo mantém a responsabilidade pela síntese e pelo contexto da consulta.'));

  const total=page;
  for(let index=1;index<=total;index+=1){doc.setPage(index);footer(doc,index,total);}
  doc.setProperties({title,subject:'Natal technical dossier',author:'Asterivum Astrology',creator:'Asterivum Astrology'});
  doc.save(`${safeName(profile.name)}-natal-technical-dossier.pdf`);
}
