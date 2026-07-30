import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Building2, Crosshair, ExternalLink, Lightbulb, List, Map, MapPin, RefreshCw, Search, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { api } from './api';
import { useI18n } from './i18n';
import type { DirectoryListing, LocationResult, TherapySpecialty, User } from './types';
import SpecialtyIcon from './SpecialtyIcon';

const rasterStyle:maplibregl.StyleSpecification={
  version:8,
  sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},
  layers:[{id:'osm',type:'raster',source:'osm'}],
};

export default function WellnessDirectoryView({onProvider,user,onAccount}:{onProvider:()=>void;user:User|null;onAccount:()=>void}) {
  const {t,language}=useI18n();
  const mapNode=useRef<HTMLDivElement>(null);
  const map=useRef<MapLibreMap|null>(null);
  const markers=useRef<Marker[]>([]);
  const [specialties,setSpecialties]=useState<TherapySpecialty[]>([]);
  const [listings,setListings]=useState<DirectoryListing[]>([]);
  const [selected,setSelected]=useState<DirectoryListing|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [filters,setFilters]=useState({q:'',specialtyId:'',place:'',latitude:'',longitude:'',radius:'100'});
  const [places,setPlaces]=useState<LocationResult[]>([]);
  const [mobileMode,setMobileMode]=useState<'MAP'|'LIST'>('MAP');
  const [mapError,setMapError]=useState(''),[mapReady,setMapReady]=useState(false),[mapRetry,setMapRetry]=useState(0);
  const [suggestOpen,setSuggestOpen]=useState(false),[suggestBusy,setSuggestBusy]=useState(false),[suggestNotice,setSuggestNotice]=useState(''),[suggestError,setSuggestError]=useState('');
  const [suggestion,setSuggestion]=useState({kind:'NEW_SPECIALTY',suggestedNameEn:'',suggestedNamePt:'',message:''});

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const query=new URLSearchParams();
      if(filters.q.trim())query.set('q',filters.q.trim());
      if(filters.specialtyId)query.set('specialtyId',filters.specialtyId);
      if(filters.latitude&&filters.longitude){query.set('latitude',filters.latitude);query.set('longitude',filters.longitude);query.set('radius',filters.radius);}
      const result=await api<{listings:DirectoryListing[]}>(`/directory/listings?${query}`);
      setListings(result.listings);
      if(selected&&!result.listings.some(item=>item.id===selected.id))setSelected(null);
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  };
  useEffect(()=>{api<{specialties:TherapySpecialty[]}>('/directory/specialties').then(r=>setSpecialties(r.specialties)).catch(e=>setError((e as Error).message));},[]);
  useEffect(()=>{void load();},[filters.specialtyId,filters.latitude,filters.longitude,filters.radius]);
  useEffect(()=>{
    if(filters.place.trim().length<3){setPlaces([]);return;}
    const timer=window.setTimeout(()=>api<{results:LocationResult[]}>(`/locations/search?q=${encodeURIComponent(filters.place)}`).then(r=>setPlaces(r.results)).catch(()=>setPlaces([])),350);
    return()=>clearTimeout(timer);
  },[filters.place]);
  useEffect(()=>{
    if(!mapNode.current||map.current)return;
    setMapError('');setMapReady(false);
    const configured=import.meta.env.VITE_MAP_STYLE_URL as string|undefined;
    let instance:MapLibreMap;
    try{
      instance=new maplibregl.Map({container:mapNode.current,style:configured||rasterStyle,center:[-8,39.5],zoom:5.4,maxZoom:18});
    }catch(error){
      console.error('Atlas map could not start',error);
      setMapError(t('Interactive maps are not supported by this browser.'));
      return;
    }
    instance.on('load',()=>{setMapReady(true);setMapError('');});
    instance.on('error',event=>{
      console.error('Atlas map failed',event.error);
      if(!instance.isStyleLoaded())setMapError(t('The map tiles could not be loaded. The provider list remains available.'));
    });
    instance.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
    instance.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
    map.current=instance;
    const observer=new ResizeObserver(()=>instance.resize());observer.observe(mapNode.current);
    return()=>{observer.disconnect();instance.remove();map.current=null;};
  },[mapRetry,language]);
  useEffect(()=>{window.setTimeout(()=>map.current?.resize(),0);},[mobileMode]);
  useEffect(()=>{
    if(!map.current)return;
    markers.current.forEach(marker=>marker.remove());markers.current=[];
    const bounds=new maplibregl.LngLatBounds();
    listings.forEach(listing=>{
      const location=listing.locations.find(item=>item.isPrimary)||listing.locations[0];if(!location)return;
      const node=document.createElement('button');node.className=`atlas-marker ${selected?.id===listing.id?'selected':''}`;
      node.type='button';node.title=listing.name;node.setAttribute('aria-label',listing.name);node.innerHTML=listing.listingType==='CLINIC'?'<span>✚</span>':'<span>●</span>';node.onclick=()=>setSelected(listing);
      markers.current.push(new maplibregl.Marker({element:node,anchor:'bottom'}).setLngLat([location.longitude,location.latitude]).addTo(map.current!));bounds.extend([location.longitude,location.latitude]);
    });
    if(listings.length===1)map.current.flyTo({center:bounds.getCenter(),zoom:11});
    else if(listings.length>1)map.current.fitBounds(bounds,{padding:70,maxZoom:12,duration:700});
  },[listings,selected?.id,mapReady]);

  const specialtyName=(item:TherapySpecialty)=>language==='pt-PT'?item.namePt:item.nameEn;
  const selectedLocation=selected&&(selected.locations.find(item=>item.isPrimary)||selected.locations[0]);
  const countLabel=useMemo(()=>`${listings.length} ${t(listings.length===1?'result':'results')}`,[listings.length,language]);
  const submitSuggestion=async()=>{
    setSuggestBusy(true);setSuggestError('');
    try{await api('/directory/suggestions',{method:'POST',body:JSON.stringify(suggestion)});setSuggestNotice(t('Thank you. Your suggestion was sent for review.'));setSuggestion({kind:'NEW_SPECIALTY',suggestedNameEn:'',suggestedNamePt:'',message:''});}
    catch(e){setSuggestError((e as Error).message);}finally{setSuggestBusy(false);}
  };

  return <div className="atlas-page">
    <header className="page-head compact"><div><p className="eyebrow">{t('Asterivum Atlas')}</p><h1>{t('Find complementary care')}</h1><p className="muted">{t('Explore practitioners and clinics by location and specialty.')}</p></div><div className="head-controls"><button className="ghost" onClick={()=>user?setSuggestOpen(true):onAccount()}><Lightbulb size={17}/>{t('Suggest an option')}</button><button className="primary" onClick={onProvider}><MapPin size={17}/>{t('Add your practice')}</button></div></header>
    <section className="atlas-filters">
      <label><span>{t('Search')}</span><div className="search"><Search size={16}/><input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&void load()} placeholder={t('Name, therapy or keyword')}/></div></label>
      <label><span>{t('Specialty')}</span><select value={filters.specialtyId} onChange={e=>setFilters({...filters,specialtyId:e.target.value})}><option value="">{t('All specialties')}</option>{specialties.map(item=><option key={item.id} value={item.id}>{specialtyName(item)}</option>)}</select></label>
      <label className="atlas-place"><span>{t('Near')}</span><div className="location-field"><input value={filters.place} onChange={e=>setFilters({...filters,place:e.target.value,latitude:'',longitude:''})} placeholder={t('City or postal code')}/>{places.length>0&&<div className="location-results">{places.map(place=><button key={place.id} type="button" onClick={()=>{setFilters({...filters,place:place.label,latitude:String(place.latitude),longitude:String(place.longitude)});setPlaces([]);map.current?.flyTo({center:[place.longitude,place.latitude],zoom:10});}}><strong>{place.name}</strong><span>{place.label}</span></button>)}</div>}</div></label>
      <label><span>{t('Radius')}</span><select value={filters.radius} onChange={e=>setFilters({...filters,radius:e.target.value})}><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option><option value="250">250 km</option><option value="500">500 km</option></select></label>
      <button className="ghost atlas-search-button" onClick={()=>void load()}><Search size={16}/>{t('Search')}</button>
    </section>
    <div className="atlas-mobile-toggle"><button className={mobileMode==='MAP'?'active':''} onClick={()=>setMobileMode('MAP')}><Map size={15}/>{t('Map')}</button><button className={mobileMode==='LIST'?'active':''} onClick={()=>setMobileMode('LIST')}><List size={15}/>{t('List')}</button></div>
    {error&&<div className="error">{error}</div>}
    <section className={`atlas-layout mobile-${mobileMode.toLowerCase()}`}>
      <aside className="atlas-results"><div className="atlas-result-head"><strong>{countLabel}</strong>{filters.latitude&&<span><Crosshair size={12}/>{t('Sorted by distance')}</span>}</div>
        {loading?<div className="atlas-empty">{t('Searching directory…')}</div>:listings.length===0?<div className="atlas-empty"><MapPin/><strong>{t('No approved listings found')}</strong><span>{t('Try a larger radius or fewer filters.')}</span></div>:listings.map(listing=>{const location=listing.locations.find(item=>item.isPrimary)||listing.locations[0];return <button type="button" className={`atlas-result ${selected?.id===listing.id?'selected':''}`} key={listing.id} onClick={()=>{setSelected(listing);map.current?.flyTo({center:[location.longitude,location.latitude],zoom:12});}}><span className="atlas-result-icon">{listing.listingType==='CLINIC'?<Building2/>:<Stethoscope/>}</span><span className="grow"><strong>{listing.name}</strong><small><MapPin size={11}/>{location.city}, {location.country}{listing.distanceKm!=null&&` · ${listing.distanceKm.toFixed(1)} km`}</small><span>{listing.summary}</span><span className="atlas-tags">{listing.specialties.slice(0,3).map(item=><i key={item.id}><SpecialtyIcon iconKey={item.iconKey}/>{specialtyName(item)}</i>)}</span></span></button>;})}
      </aside>
      <div className="atlas-map-wrap"><div ref={mapNode} className="atlas-map" aria-label={t('Provider map')}/>{!mapReady&&!mapError&&<div className="atlas-map-message">{t('Loading map…')}</div>}{mapError&&<div className="atlas-map-message error"><MapPin/><strong>{mapError}</strong><button className="ghost" onClick={()=>setMapRetry(value=>value+1)}><RefreshCw size={14}/>{t('Retry map')}</button></div>}
        {selected&&selectedLocation&&<article className="atlas-detail"><button className="icon-btn atlas-close" onClick={()=>setSelected(null)} aria-label={t('Close')}>×</button><p className="eyebrow">{t(selected.listingType==='CLINIC'?'Clinic':'Practitioner')}</p><h2>{selected.name}</h2>{selectedLocation.imageUrl&&<img className="atlas-location-image" src={selectedLocation.imageUrl} alt={`${selected.name} · ${selectedLocation.label}`}/>}<p>{selected.description}</p><div className="atlas-tags">{selected.specialties.map(item=><i key={item.id}><SpecialtyIcon iconKey={item.iconKey}/>{specialtyName(item)}{item.regulated?' · '+t('regulated'):''}</i>)}</div><dl><div><dt>{t('Location')}</dt><dd>{[selectedLocation.address,selectedLocation.city,selectedLocation.region,selectedLocation.country].filter(Boolean).join(', ')}</dd></div><div><dt>{t('Languages')}</dt><dd>{selected.languages.join(', ')}</dd></div></dl>{selected.credentials.length>0&&<div className="credential-list"><strong>{t('Declared qualifications')}</strong>{selected.credentials.map((credential,index)=><span key={index}><ShieldCheck size={13}/>{credential.title}{credential.issuer&&` · ${credential.issuer}`} <small>{t('Not independently verified')}</small></span>)}</div>}<div className="atlas-contact">{selected.website&&<a className="primary" href={selected.website} target="_blank" rel="noreferrer">{t('Website')}<ExternalLink size={14}/></a>}{selected.email&&<a className="ghost" href={`mailto:${selected.email}`}>{t('Email')}</a>}{selected.phone&&<a className="ghost" href={`tel:${selected.phone}`}>{selected.phone}</a>}</div><small className="atlas-disclaimer">{t('Directory approval confirms publication standards only. It is not a medical endorsement or proof of effectiveness. For emergencies, contact the appropriate emergency service.')}</small></article>}
      </div>
    </section>
    {suggestOpen&&<div className="modal-bg"><section className="modal suggestion-modal"><div className="modal-head"><div><p className="eyebrow">{t('Community suggestions')}</p><h2>{t('Suggest a directory option')}</h2></div><button className="icon-btn" onClick={()=>setSuggestOpen(false)}><X/></button></div>{suggestNotice?<div className="success">{suggestNotice}</div>:<><label>{t('Suggestion type')}<select value={suggestion.kind} onChange={e=>setSuggestion({...suggestion,kind:e.target.value})}><option value="NEW_SPECIALTY">{t('New specialty')}</option><option value="CORRECTION">{t('Correction')}</option><option value="TRANSLATION">{t('Translation')}</option><option value="OTHER">{t('Other')}</option></select></label><div className="form-grid"><label>{t('English name')}<input value={suggestion.suggestedNameEn} onChange={e=>setSuggestion({...suggestion,suggestedNameEn:e.target.value})}/></label><label>{t('Portuguese name')}<input value={suggestion.suggestedNamePt} onChange={e=>setSuggestion({...suggestion,suggestedNamePt:e.target.value})}/></label><label className="span-2">{t('Reason or details')}<textarea rows={5} value={suggestion.message} onChange={e=>setSuggestion({...suggestion,message:e.target.value})}/></label></div>{suggestError&&<div className="error">{suggestError}</div>}<div className="modal-actions"><button className="ghost" onClick={()=>setSuggestOpen(false)}>{t('Cancel')}</button><button className="primary" disabled={suggestBusy} onClick={()=>void submitSuggestion()}>{t('Send suggestion')}</button></div></>}</section></div>}
  </div>;
}
