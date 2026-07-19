import { useEffect, useMemo, useState } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { Globe2 } from "lucide-react";
import { api } from "./api";
import type { AstroLine, AstroMapResult, Profile } from "./types";
import { useI18n } from "./i18n";

const colors:Record<string,string>={Sun:"#d99b28",Moon:"#73859a",Mercury:"#7a6a55",Venus:"#4a9a71",Mars:"#c95445",Jupiter:"#9b6ab0",Saturn:"#5e6470",Uranus:"#3b91a5",Neptune:"#4772b3",Pluto:"#7a4a66"};
function segments(points:AstroLine["points"]) {
  const result:number[][][]=[]; let current:number[][]=[];
  points.forEach((point,index)=>{ if(index&&Math.abs(point.longitude-points[index-1].longitude)>180){ if(current.length>1)result.push(current); current=[]; } current.push([point.longitude,point.latitude]); });
  if(current.length>1)result.push(current); return result;
}

export default function AstroMapView({profiles}:{profiles:Profile[]}) {
  const {t}=useI18n();
  const [id,setId]=useState(profiles[0]?.id||0),[data,setData]=useState<AstroMapResult|null>(null),[planet,setPlanet]=useState("ALL"),[angle,setAngle]=useState("ALL"),[selected,setSelected]=useState<AstroLine|null>(null);
  useEffect(()=>{ if(id) api<AstroMapResult>(`/astrocartography/${id}`).then(setData); },[id]);
  const countries=useMemo(()=>feature(world as never,(world as unknown as {objects:{countries:never}}).objects.countries),[]);
  const projection=useMemo(()=>geoNaturalEarth1().fitExtent([[8,8],[992,492]],{type:"Sphere"}),[]);
  const path=useMemo(()=>geoPath(projection),[projection]);
  const visible=data?.lines.filter(line=>(planet==="ALL"||line.planet===planet)&&(angle==="ALL"||line.angle===angle))||[];
  const profile=profiles.find(item=>item.id===id);
  return <>
    <header className="page-head compact"><div><p className="eyebrow">{t("Locational astrology")}</p><h1>{t("Astrocartography")}</h1><p className="muted">{t("See where each natal planet was angular - rising, setting, culminating, or at the lower meridian.")}</p></div></header>
    <div className="filter-card map-controls"><label>{t("Profile")}<select value={id} onChange={event=>setId(Number(event.target.value))}>{profiles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>{t("Planet")}<select value={planet} onChange={event=>setPlanet(event.target.value)}><option value="ALL">{t("All planets")}</option>{Object.keys(colors).map(name=><option value={name} key={name}>{t(name)}</option>)}</select></label><label>{t("Angle")}<select value={angle} onChange={event=>setAngle(event.target.value)}><option value="ALL">{t("All angles")}</option><option value="ASC">{t("Ascendant")}</option><option value="DSC">{t("Descendant")}</option><option value="MC">{t("Midheaven")}</option><option value="IC">{t("Lower meridian")}</option></select></label></div>
    {!data?<div className="loading">{t("Projecting planetary lines…")}</div>:<section className="astro-map-card">
      <svg viewBox="0 0 1000 500" className="astro-map" role="img" aria-label={`Astrocartography world map for ${profile?.name||"profile"}`} onMouseLeave={()=>setSelected(null)}>
        <path d={path({type:"Sphere"})||""} className="map-ocean"/>
        <path d={path(countries as never)||""} className="map-land"/>
        <path d={path(geoGraticule10())||""} className="map-graticule"/>
        {visible.map((line,index)=><path key={`${line.planet}-${line.angle}-${index}`} d={path({type:"MultiLineString",coordinates:segments(line.points)} as never)||""} className={`astro-line angle-${line.angle.toLowerCase()}`} style={{stroke:colors[line.planet]}} onMouseEnter={()=>setSelected(line)}><title>{line.planet} {line.angle}</title></path>)}
        {data.birthplace&&<circle cx={projection([data.birthplace.longitude,data.birthplace.latitude])?.[0]} cy={projection([data.birthplace.longitude,data.birthplace.latitude])?.[1]} r="4" className="birthplace-dot"><title>{data.birthplace.place}</title></circle>}
      </svg>
      <div className="map-legend">{Object.entries(colors).filter(([name])=>planet==="ALL"||planet===name).map(([name,color])=><span key={name}><i style={{background:color}}/>{t(name)}</span>)}</div>
      <div className="map-detail"><Globe2 size={17}/>{selected?<><strong>{selected.glyph} {t(selected.planet)} {selected.angle}</strong><span>{t(selected.angle==="MC"?"public direction and visibility":selected.angle==="IC"?"roots, home and inner foundations":selected.angle==="ASC"?"identity, embodiment and new beginnings":"partnerships and significant encounters")}</span></>:<><strong>{profile?.name}</strong><span>{t("Hover a planetary line for its angular emphasis.")}</span></>}</div>
    </section>}
  </>;
}
