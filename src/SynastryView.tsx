import { useEffect, useState } from "react";
import { Download, HeartHandshake, Printer, Sparkles } from "lucide-react";
import { api } from "./api";
import ChartWheel from "./ChartWheel";
import type { Profile, SynastryResult } from "./types";
import { useI18n } from "./i18n";

export default function SynastryView({profiles}:{profiles:Profile[]}) {
  const {t,language}=useI18n();
  const [firstId,setFirstId] = useState(profiles[0]?.id || 0);
  const [secondId,setSecondId] = useState(profiles[1]?.id || 0);
  const [result,setResult] = useState<SynastryResult|null>(null);
  const [loading,setLoading] = useState(false);
  const first = profiles.find(profile=>profile.id===firstId);
  const second = profiles.find(profile=>profile.id===secondId);
  const load = async () => {
    if (!firstId || !secondId || firstId===secondId) return;
    setLoading(true);
    try { setResult(await api<SynastryResult>(`/synastry?firstId=${firstId}&secondId=${secondId}`)); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ if(firstId&&secondId&&firstId!==secondId) void load(); },[firstId,secondId,language]);
  if (profiles.length < 2) return <div className="empty"><HeartHandshake/><h3>{t("Two birth profiles are required")}</h3><p>{t("Add another person before calculating relationship dynamics.")}</p></div>;
  return <>
    <header className="page-head compact"><div><p className="eyebrow">{t("Relationship astrology")}</p><h1>{t("Synastry studio")}</h1><p className="muted">{t("Compare two natal charts, their strongest contacts, and the balance of ease and developmental tension.")}</p></div></header>
    <div className="filter-card no-print">
      <label>{t("Person A")}<select value={firstId} onChange={event=>setFirstId(Number(event.target.value))}>{profiles.map(profile=><option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
      <label>{t("Person B")}<select value={secondId} onChange={event=>setSecondId(Number(event.target.value))}>{profiles.map(profile=><option value={profile.id} key={profile.id} disabled={profile.id===firstId}>{profile.name}</option>)}</select></label>
      <button className="primary" onClick={load} disabled={loading||firstId===secondId}><Sparkles size={16}/>{t(loading?"Comparing…":"Compare charts")}</button>
      <button className="ghost" onClick={()=>window.print()} disabled={!result}><Printer size={16}/>{t("Print")}</button>
      <button className="ghost" disabled={!result} onClick={async()=>{
        const svg=document.querySelector(".synastry-wheel .chart-wheel") as SVGSVGElement|null;
        if(result&&first&&second&&svg) { const {exportChartPdf}=await import("./pdfExports"); await exportChartPdf({...first,name:`${first.name} + ${second.name}`},result.chart,svg); }
      }}><Download size={16}/>{t("Export PDF")}</button>
    </div>
    {loading ? <div className="loading">{t("Comparing both natal skies…")}</div> : result&&first&&second ? <>
      <section className="print-only print-report-head"><p>Asterivum Astrology · {t("Synastry")}</p><h1>{first.name} + {second.name}</h1><span>{t("Paired natal chart and inter-chart aspects")}</span></section>
      <div className="synastry-layout">
        <section className="wheel-card synastry-wheel"><ChartWheel chart={result.chart}/></section>
        <aside className="synastry-summary">
          <p className="eyebrow">{t("Relationship pattern")}</p><div className="compatibility-score">{result.summary.score}<small>/100</small></div>
          <h2>{result.summary.label}</h2>
          <p>{t("This is an aspect balance, not a verdict. Strong relationships can contain both harmony and demanding contacts.")}</p>
          <div className="synastry-counts"><span><b>{result.summary.harmony}</b> {t("supportive")}</span><span><b>{result.summary.tension}</b> {t("developmental")}</span><span><b>{result.summary.conjunctions}</b> {t("intensifying")}</span></div>
        </aside>
        <section className="synastry-aspects"><div className="section-title"><div><p className="eyebrow">{t("Inter-chart aspects")}</p><h2>{t("Strongest contacts")}</h2></div><span>{result.summary.total} {t("found")}</span></div>
          {result.highlights.map((aspect,index)=><article className="synastry-contact" key={`${aspect.from}-${aspect.to}-${index}`}><span className={`event-icon ${aspect.type.toLowerCase()}`}>{aspect.glyph}</span><div><strong>{second.name} · {t(aspect.from)} {t(aspect.type).toLowerCase()} {first.name} · {t(aspect.to)}</strong><p>{aspect.interpretation}</p></div><small>{aspect.orb.toFixed(2)}° · {aspect.tone}</small></article>)}
        </section>
      </div>
    </> : null}
  </>;
}
