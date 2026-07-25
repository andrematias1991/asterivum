import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Globe2, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { api } from "./api";
import type { AstroLine, AstroMapResult, Profile } from "./types";
import { useI18n } from "./i18n";

const colors:Record<string,string>={
  Sun:"#d99b28",Moon:"#73859a",Mercury:"#7a6a55",Venus:"#4a9a71",Mars:"#c95445",
  Jupiter:"#9b6ab0",Saturn:"#5e6470",Uranus:"#3b91a5",Neptune:"#4772b3",Pluto:"#7a4a66",
  Node:"#687f55",Chiron:"#a05b40",Lilith:"#29202e",
};

function segments(points:AstroLine["points"]) {
  const result:number[][][]=[]; let current:number[][]=[];
  points.forEach((point,index)=>{
    if(index&&Math.abs(point.longitude-points[index-1].longitude)>180){
      if(current.length>1) result.push(current);
      current=[];
    }
    current.push([point.longitude,point.latitude]);
  });
  if(current.length>1) result.push(current);
  return result;
}

export default function AstroMapView({profiles}:{profiles:Profile[]}) {
  const {t}=useI18n();
  const [id,setId]=useState(profiles[0]?.id||0);
  const [data,setData]=useState<AstroMapResult|null>(null);
  const [angle,setAngle]=useState("ALL");
  const [hiddenPlanets,setHiddenPlanets]=useState<Set<string>>(new Set());
  const [selected,setSelected]=useState<AstroLine|null>(null);
  const [mapScale,setMapScale]=useState(1);
  const [countries,setCountries]=useState<unknown>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!id) return;
    setData(null); setError(""); setSelected(null);
    api<AstroMapResult>(`/astrocartography/${id}`).then(setData).catch(value=>setError((value as Error).message));
  },[id]);

  useEffect(()=>{
    let active=true;
    import("world-atlas/countries-50m.json").then(({default:world})=>{
      if(active) setCountries(feature(world as never,(world as unknown as {objects:{countries:never}}).objects.countries));
    }).catch(()=>{ if(active) setError(t("The detailed world map could not be loaded.")); });
    return()=>{active=false;};
  },[t]);

  const projection=useMemo(()=>geoNaturalEarth1().fitExtent([[8,8],[992,492]],{type:"Sphere"}),[]);
  const path=useMemo(()=>geoPath(projection),[projection]);
  const planets=useMemo(()=>Array.from(new Set(data?.lines.map(line=>line.planet)||[])),[data]);
  const visible=data?.lines.filter(line=>!hiddenPlanets.has(line.planet)&&(angle==="ALL"||line.angle===angle))||[];
  const profile=profiles.find(item=>item.id===id);

  const togglePlanet=(name:string)=>{
    setHiddenPlanets(current=>{
      const next=new Set(current);
      if(next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    if(selected?.planet===name) setSelected(null);
  };
  const lineLabel=(line:AstroLine)=>`${t(line.planet)} ${line.angle}`;
  const lineWidth=(line:AstroLine)=>Math.max(0.42,(selected===line?3.4:1.45)/Math.sqrt(mapScale));
  const selectFromKeyboard=(event:KeyboardEvent<SVGPathElement>,line:AstroLine)=>{
    if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(line);}
  };

  return <>
    <header className="page-head compact"><div><p className="eyebrow">{t("Locational astrology")}</p><h1>{t("Astrocartography")}</h1><p className="muted">{t("See where each natal planet was angular - rising, setting, culminating, or at the lower meridian.")}</p></div></header>
    <div className="filter-card map-controls">
      <label>{t("Profile")}<select value={id} onChange={event=>setId(Number(event.target.value))}>{profiles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>{t("Angle")}<select value={angle} onChange={event=>setAngle(event.target.value)}><option value="ALL">{t("All angles")}</option><option value="ASC">{t("Ascendant")}</option><option value="DSC">{t("Descendant")}</option><option value="MC">{t("Midheaven")}</option><option value="IC">{t("Lower meridian")}</option></select></label>
      <div className="map-instructions"><strong>{t("Interactive map")}</strong><span>{t("Drag to move, scroll or pinch to zoom, and select a line for details.")}</span></div>
    </div>
    {error?<div className="error">{error}</div>:!data?<div className="loading">{t("Projecting planetary lines…")}</div>:<section className="astro-map-card">
      <TransformWrapper initialScale={1} minScale={1} maxScale={8} centerOnInit limitToBounds centerZoomedOut wheel={{step:0.18}} doubleClick={{mode:"zoomIn",step:0.7}} panning={{velocityDisabled:true}} onTransform={(_ref,state)=>setMapScale(state.scale)}>
        {({zoomIn,zoomOut,resetTransform,centerView})=><>
          <div className="map-zoom-controls no-print" aria-label={t("Map zoom controls")}>
            <button type="button" onClick={()=>zoomIn()} title={t("Zoom in")} aria-label={t("Zoom in")}><ZoomIn size={17}/></button>
            <button type="button" onClick={()=>zoomOut()} title={t("Zoom out")} aria-label={t("Zoom out")}><ZoomOut size={17}/></button>
            <button type="button" onClick={()=>centerView(1)} title={t("Fit world")} aria-label={t("Fit world")}><Maximize2 size={17}/></button>
            <button type="button" onClick={()=>resetTransform()} title={t("Reset map")} aria-label={t("Reset map")}><RotateCcw size={17}/></button>
            <output className="map-zoom-level" aria-live="polite">{Math.round(mapScale*100)}%</output>
          </div>
          <TransformComponent wrapperClass="astro-map-viewport" contentClass="astro-map-content">
            <svg viewBox="0 0 1000 500" className="astro-map" role="img" aria-label={`Astrocartography world map for ${profile?.name||"profile"}`}>
              <path d={path({type:"Sphere"})||""} className="map-ocean"/>
              {countries?<path d={path(countries as never)||""} className="map-land"/>:null}
              <path d={path(geoGraticule10())||""} className="map-graticule"/>
              {visible.map((line,index)=>{
                const d=path({type:"MultiLineString",coordinates:segments(line.points)} as never)||"";
                const key=`${line.planet}-${line.angle}-${index}`;
                return <g key={key} className={selected===line?"is-selected":""}>
                  <path d={d} className="astro-line-hit" onClick={()=>setSelected(line)} onMouseEnter={()=>setSelected(line)} onKeyDown={event=>selectFromKeyboard(event,line)} tabIndex={0} role="button" aria-label={lineLabel(line)}/>
                  <path d={d} className={`astro-line angle-${line.angle.toLowerCase()}`} style={{stroke:colors[line.planet]||"#5e6470",strokeWidth:lineWidth(line)}} pointerEvents="none"><title>{lineLabel(line)}</title></path>
                </g>;
              })}
              {data.birthplace&&<circle cx={projection([data.birthplace.longitude,data.birthplace.latitude])?.[0]} cy={projection([data.birthplace.longitude,data.birthplace.latitude])?.[1]} r="4" className="birthplace-dot"><title>{data.birthplace.place}</title></circle>}
            </svg>
          </TransformComponent>
        </>}
      </TransformWrapper>
      <div className="map-legend" aria-label={t("Planet visibility")}>
        {planets.map(name=><button type="button" className={hiddenPlanets.has(name)?"is-hidden":"is-visible"} onClick={()=>togglePlanet(name)} aria-pressed={!hiddenPlanets.has(name)} key={name}><i style={{background:colors[name]||"#5e6470"}}/><b>{data.lines.find(line=>line.planet===name)?.glyph}</b>{t(name)}</button>)}
        <button type="button" className="map-show-all" onClick={()=>setHiddenPlanets(new Set())}>{t("Show all")}</button>
      </div>
      <div className="map-detail"><Globe2 size={17}/>{selected?<><strong>{selected.glyph} {t(selected.planet)} {selected.angle}</strong><span>{t(selected.angle==="MC"?"public direction and visibility":selected.angle==="IC"?"roots, home and inner foundations":selected.angle==="ASC"?"identity, embodiment and new beginnings":"partnerships and significant encounters")}</span><button type="button" onClick={()=>setSelected(null)} aria-label={t("Clear selection")}>×</button></>:<><strong>{profile?.name}</strong><span>{t("Select a planetary line for its angular emphasis.")}</span></>}</div>
    </section>}
  </>;
}
