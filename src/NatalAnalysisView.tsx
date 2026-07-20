import { useEffect, useState } from 'react';
import { BookOpen, Download, Printer } from 'lucide-react';
import { api } from './api';
import ChartWheel from './ChartWheel';
import { useI18n } from './i18n';
import type { NatalAnalysis, NatalDistribution, Profile } from './types';

function Distribution({title,data}:{title:string;data:NatalDistribution}) {
  const {t}=useI18n();
  const max=Math.max(...Object.values(data.counts),1);
  return <section className="analysis-panel distribution-panel">
    <h3>{title}</h3>
    {Object.entries(data.counts).map(([name,count])=><div className="distribution-row" key={name}>
      <span>{t(name)}</span><div><i style={{width:`${count/max*100}%`}}/></div><b>{count}</b>
    </div>)}
    <p><strong>{t('Dominant')}:</strong> {data.dominant.map(t).join(', ')} · <strong>{t('Least represented')}:</strong> {data.deficient.map(t).join(', ')}</p>
  </section>;
}

export default function NatalAnalysisView({profiles}:{profiles:Profile[]}) {
  const {t,language}=useI18n();
  const [id,setId]=useState(profiles[0]?.id||0);
  const [analysis,setAnalysis]=useState<NatalAnalysis|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const profile=profiles.find(item=>item.id===id);

  useEffect(()=>{ if (!profiles.some(item=>item.id===id)&&profiles[0]) setId(profiles[0].id); },[profiles,id]);
  useEffect(()=>{
    if(!id){setAnalysis(null);return;}
    setLoading(true);setError('');
    api<{analysis:NatalAnalysis}>(`/natal-analysis/${id}`).then(result=>setAnalysis(result.analysis)).catch(value=>setError((value as Error).message)).finally(()=>setLoading(false));
  },[id,language]);

  if(!profiles.length) return <><header className="page-header"><div><p className="eyebrow">{t('Natal technical toolkit')}</p><h1>{t('Natal Analysis Workspace')}</h1></div></header><div className="empty"><BookOpen/><h3>{t('Add a birth profile first')}</h3></div></>;

  const exportPdf=async()=>{ if(analysis&&profile){const {exportNatalAnalysisPdf}=await import('./pdfExports');exportNatalAnalysisPdf(profile,analysis);} };
  return <>
    <header className="page-header no-print"><div><p className="eyebrow">{t('Natal technical toolkit')}</p><h1>{t('Natal Analysis Workspace')}</h1><p>{t('Computed chart factors for professional consultation, study and interpretation.')}</p></div>
      <div className="header-actions"><select aria-label={t('Profile')} value={id} onChange={event=>setId(Number(event.target.value))}>{profiles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="ghost" disabled={!analysis} onClick={()=>window.print()}><Printer size={16}/>{t('Print')}</button><button className="ghost" disabled={!analysis} onClick={exportPdf}><Download size={16}/>{t('Export PDF')}</button></div>
    </header>
    {error&&<div className="error">{error}</div>}
    {loading||!analysis||!profile?<div className="loading">{t('Building the natal analysis…')}</div>:<div className="natal-analysis-report">
      <section className="print-only print-report-head"><p>Asterivum Astrology · {t('Natal Technical Dossier')}</p><h1>{profile.name}</h1><span>{profile.birthDate} · {profile.birthTime} · {profile.place} · {profile.houseSystem.replace('_',' ')}</span></section>

      <section className="analysis-hero">
        <div className="analysis-wheel"><ChartWheel chart={analysis.chart}/></div>
        <div className="analysis-summary-cards">
          <article><span>{t('Chart signature')}</span><strong>{analysis.signature.sign?t(analysis.signature.sign):t('Mixed signature')}</strong><p>{analysis.signature.element?t(analysis.signature.element):t('Tied elements')} · {analysis.signature.modality?t(analysis.signature.modality):t('Tied modalities')}</p></article>
          <article><span>{t('Chart ruler')}</span><strong>{t(analysis.chartRuler.name)}</strong><p>{t(analysis.chartRuler.placement.sign)} · {t('House')} {analysis.chartRuler.placement.house}{analysis.chartRuler.modernCoRuler?` · ${t('co-ruler')} ${t(analysis.chartRuler.modernCoRuler)}`:''}</p></article>
          <article><span>{t('Lunation phase')}</span><strong>{t(analysis.lunation.phase)}</strong><p>{analysis.lunation.elongation.toFixed(2)}° · {t(analysis.lunation.waxing?'Waxing':'Waning')}</p></article>
          <article><span>{t('Dominant orientation')}</span><strong>{analysis.hemispheres.above>analysis.hemispheres.below?t('Above horizon'):analysis.hemispheres.below>analysis.hemispheres.above?t('Below horizon'):t('Balanced horizon')}</strong><p>{analysis.hemispheres.eastern>analysis.hemispheres.western?t('Eastern hemisphere'):analysis.hemispheres.western>analysis.hemispheres.eastern?t('Western hemisphere'):t('Balanced hemispheres')}</p></article>
        </div>
      </section>

      <section className="analysis-block"><div className="analysis-section-heading"><p className="eyebrow">{t('Chart structure')}</p><h2>{t('Technical structure')}</h2></div>
        <div className="distribution-grid"><Distribution title={t('Elements')} data={analysis.elements}/><Distribution title={t('Modalities')} data={analysis.modalities}/><Distribution title={t('Polarity')} data={analysis.polarities}/></div>
        <div className="analysis-panel orientation-panel"><h3>{t('Hemispheres and quadrants')}</h3><div><span>{t('Above horizon')}<b>{analysis.hemispheres.above}</b></span><span>{t('Below horizon')}<b>{analysis.hemispheres.below}</b></span><span>{t('Eastern hemisphere')}<b>{analysis.hemispheres.eastern}</b></span><span>{t('Western hemisphere')}<b>{analysis.hemispheres.western}</b></span>{analysis.quadrants.map(item=><span key={item.number}>{t('Quadrant')} {item.number}<b>{item.count}</b></span>)}</div></div>
      </section>

      <section className="analysis-block"><div className="analysis-section-heading"><p className="eyebrow">{t('Planet · Sign · House')}</p><h2>{t('Planetary placements')}</h2></div>
        <div className="analysis-table-wrap"><table className="analysis-table"><thead><tr><th>{t('Planet')}</th><th>{t('Position')}</th><th>{t('House')}</th><th>{t('Element')}</th><th>{t('Modality')}</th><th>{t('Dignity')}</th></tr></thead><tbody>{analysis.planets.map(planet=><tr key={planet.name}><td><b>{planet.glyph} {t(planet.name==='Node'?'North Node':planet.name)}</b></td><td>{planet.degree}°{String(planet.minute).padStart(2,'0')}′ {t(planet.sign)}{planet.retrograde?' ℞':''}</td><td>{planet.house}</td><td>{t(planet.element)}</td><td>{t(planet.modality)}</td><td>{t(planet.dignity.status)}{planet.dignity.disputed&&planet.dignity.status!=='Neutral'?<small title={t('Modern association without astrological consensus')}> *</small>:''}</td></tr>)}</tbody></table></div>
      </section>

      <section className="analysis-block"><div className="analysis-section-heading"><p className="eyebrow">{t('Angular foundations')}</p><h2>{t('Angles and rulers')}</h2></div>
        <div className="angle-analysis-grid">{analysis.angles.map(angle=><article key={angle.name}><span>{t(angle.name)}</span><strong>{angle.degree}°{String(angle.minute).padStart(2,'0')}′ {t(angle.sign)}</strong><p>{t('Ruler')}: {t(angle.ruler)}{angle.modernCoRuler?` · ${t('co-ruler')} ${t(angle.modernCoRuler)}`:''}</p>{angle.nearbyPlanets.map(planet=><small key={planet.name}>{t(planet.name)} · {planet.distance.toFixed(2)}°</small>)}</article>)}</div>
        <div className="house-ruler-grid">{analysis.houseRulers.map(item=><span key={item.house}><b>{item.house}</b><small>{t(item.sign)}</small><strong>{t(item.ruler)}</strong>{item.modernCoRuler&&<em>+ {t(item.modernCoRuler)}</em>}</span>)}</div>
      </section>

      <section className="analysis-reading"><div className="analysis-section-heading"><p className="eyebrow">{t('Computed factors for consultation and study')}</p><h2>{t('Analysis reference')}</h2></div>
        <div className="analysis-evidence-grid">{[...analysis.sections.origins,...analysis.sections.direction].map(item=><article key={item.key}>
          <h3>{item.title}</h3><p>{item.summary}</p>
          {item.evidence.length>0&&<ul>{item.evidence.map((evidence,index)=><li key={`${item.key}-${index}`}>{evidence}</li>)}</ul>}
        </article>)}</div>
      </section>

      <section className="analysis-block"><div className="analysis-section-heading"><p className="eyebrow">{t('Ranked by aspect type, orb and planets involved')}</p><h2>{t('Significant aspects')}</h2></div><div className="significant-aspects">{analysis.significantAspects.slice(0,10).map((aspect,index)=><article key={`${aspect.from}-${aspect.to}-${index}`}><span className={`aspect-symbol ${aspect.type.toLowerCase()}`}>{aspect.glyph}</span><div><strong>{t(aspect.from==='Node'?'North Node':aspect.from)} {t(aspect.type).toLowerCase()} {t(aspect.to==='Node'?'North Node':aspect.to)}</strong><p>{aspect.orb.toFixed(2)}° {t('orb')}</p></div><b>{aspect.significance}</b></article>)}</div></section>

      <details className="methodology no-print"><summary>{t('Calculation methodology')}</summary><ul><li>{t(analysis.methodology.dominanceBodies)}</li><li>{t(analysis.methodology.rulership)}</li><li>{t(analysis.methodology.node)}</li><li>{t(analysis.methodology.dignities)}</li><li>{t('Angular conjunction orb')}: {analysis.methodology.angularOrb}°</li></ul></details>
      <p className="analysis-disclaimer">{t('This workspace presents calculated chart factors. Interpretation remains with the astrologer and should consider the client’s lived experience.')}</p>
    </div>}
  </>;
}
