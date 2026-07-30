import { useEffect, useState } from 'react';
import { BadgeCheck, Building2, Camera, CheckCircle2, MapPin, Plus, Save, Send, Trash2 } from 'lucide-react';
import { api } from './api';
import { useI18n } from './i18n';
import type { DirectoryListingPayload, LocationResult, OwnedDirectoryListing, TherapySpecialty, User } from './types';
import SpecialtyIcon from './SpecialtyIcon';

const emptyLocation=()=>({label:'',address:'',city:'',region:'',country:'Portugal',postalCode:'',latitude:0,longitude:0,markerPrecision:'APPROXIMATE' as const,isPrimary:true});
const emptyPayload:DirectoryListingPayload={
  listingType:'PRACTITIONER',name:'',summary:'',description:'',email:'',phone:'',website:'',languages:['Português'],
  specialtyIds:[],credentials:[],locations:[emptyLocation()],publishEmail:false,publishPhone:false,
};

export default function ProviderListingsView({user}:{user:User}) {
  const {t,language}=useI18n();
  const [specialties,setSpecialties]=useState<TherapySpecialty[]>([]);
  const [listings,setListings]=useState<OwnedDirectoryListing[]>([]);
  const [id,setId]=useState<number|null>(null);
  const [form,setForm]=useState<DirectoryListingPayload>(emptyPayload);
  const [languageText,setLanguageText]=useState('Português');
  const [locationQueries,setLocationQueries]=useState<string[]>(['']);
  const [locationResults,setLocationResults]=useState<Record<number,LocationResult[]>>({});
  const [confirmations,setConfirmations]=useState({confirmAccuracy:false,confirmPublication:false,confirmClaims:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [requestType,setRequestType]=useState<'PROFESSIONAL'|'CLINIC'>('PROFESSIONAL'),[requestMessage,setRequestMessage]=useState(''),[requestStatus,setRequestStatus]=useState(user.verificationStatus);

  const load=()=>api<{listings:OwnedDirectoryListing[]}>('/directory/mine').then(r=>setListings(r.listings));
  useEffect(()=>{void Promise.all([load(),api<{specialties:TherapySpecialty[]}>('/directory/specialties').then(r=>setSpecialties(r.specialties))]);},[]);
  useEffect(()=>{if(!id&&user.role!=='ADMIN')setForm(current=>({...current,listingType:user.accountType==='CLINIC'?'CLINIC':'PRACTITIONER'}));},[user.accountType,id]);
  const edit=(listing:OwnedDirectoryListing)=>{
    setId(listing.id);setForm(listing.draftPayload);setLanguageText(listing.draftPayload.languages.join(', '));
    setLocationQueries(listing.draftPayload.locations.map(location=>location.label));setConfirmations({confirmAccuracy:false,confirmPublication:false,confirmClaims:false});setNotice('');setError('');
  };
  const reset=()=>{setId(null);setForm({...emptyPayload,listingType:user.accountType==='CLINIC'?'CLINIC':'PRACTITIONER'});setLanguageText('Português');setLocationQueries(['']);setNotice('');setError('');};
  const updateLocation=(index:number,patch:Partial<DirectoryListingPayload['locations'][number]>)=>setForm(current=>({...current,locations:current.locations.map((location,i)=>i===index?{...location,...patch}:location)}));
  const searchLocation=(index:number,value:string)=>{
    setLocationQueries(current=>current.map((item,i)=>i===index?value:item));updateLocation(index,{label:value});
    window.setTimeout(()=>{
      if(value.trim().length>=3)api<{results:LocationResult[]}>(`/locations/search?q=${encodeURIComponent(value.trim())}`).then(r=>setLocationResults(current=>({...current,[index]:r.results}))).catch(()=>undefined);
    },350);
  };
  const selectLocation=(index:number,result:LocationResult)=>{
    const parts=result.label.split(',').map(item=>item.trim());
    updateLocation(index,{label:result.label,city:result.name,region:parts.length>2?parts[1]:'',country:parts.at(-1)||'',latitude:result.latitude,longitude:result.longitude});
    setLocationQueries(current=>current.map((item,i)=>i===index?result.label:item));setLocationResults(current=>({...current,[index]:[]}));
  };
  const save=async()=>{
    setBusy(true);setError('');setNotice('');
    try{
      const payload={...form,languages:languageText.split(',').map(item=>item.trim()).filter(Boolean)};
      if(id)await api(`/directory/listings/${id}`,{method:'PUT',body:JSON.stringify(payload)});
      else {const created=await api<{id:number}>('/directory/listings',{method:'POST',body:JSON.stringify(payload)});setId(created.id);}
      setForm(payload);await load();setNotice(t('Draft saved'));return true;
    }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  };
  const submit=async()=>{
    if(!id){setError(t('Save the draft before submitting.'));return;}
    setBusy(true);setError('');setNotice('');
    try{if(!await save())return;await api(`/directory/listings/${id}/submit`,{method:'POST',body:JSON.stringify(confirmations)});await load();setNotice(t('Submitted for administrator review'));setConfirmations({confirmAccuracy:false,confirmPublication:false,confirmClaims:false});}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const toggleSpecialty=(specialtyId:number)=>{
    setForm(current=>({...current,specialtyIds:current.specialtyIds.includes(specialtyId)?current.specialtyIds.filter(item=>item!==specialtyId):[...current.specialtyIds,specialtyId]}));
  };
  const regulatedSelected=specialties.filter(item=>item.regulated&&form.specialtyIds.includes(item.id));
  const specialtyName=(item:TherapySpecialty)=>language==='pt-PT'?item.namePt:item.nameEn;
  const requestAccount=async()=>{
    setBusy(true);setError('');
    try{await api('/account/type-request',{method:'POST',body:JSON.stringify({accountType:requestType,message:requestMessage})});setRequestStatus('PENDING');setNotice(t('Your verification request was sent to an administrator.'));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const uploadLocationImage=async(index:number,file:File)=>{
    if(!id){setError(t('Save the draft before uploading a picture.'));return;}
    setBusy(true);setError('');
    try{
      const body=new FormData();body.append('image',file);body.append('altText',`${form.name} · ${form.locations[index].label}`);
      const result=await api<{image:{id:number;url:string}}>(`/directory/listings/${id}/image`,{method:'POST',body});
      updateLocation(index,{imageId:result.image.id,imageUrl:result.image.url});setNotice(t('Picture uploaded. Save the draft to attach it to this location.'));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };

  if(user.role!=='ADMIN'&&requestStatus!=='VERIFIED')return <div className="provider-page"><header className="page-head compact"><div><p className="eyebrow">{t('Professional accounts')}</p><h1>{t('Publish a professional presence')}</h1><p className="muted">{t('Professional and Clinic accounts can submit moderated public listings.')}</p></div></header><section className="account-request-card"><BadgeCheck/><div><h2>{requestStatus==='PENDING'?t('Verification pending'):t('Request professional access')}</h2>{requestStatus==='PENDING'?<p>{t('An administrator will review your request. You can continue using all normal registered features while you wait.')}</p>:<><label>{t('Account type')}<select value={requestType} onChange={e=>setRequestType(e.target.value as 'PROFESSIONAL'|'CLINIC')}><option value="PROFESSIONAL">{t('Professional')}</option><option value="CLINIC">{t('Clinic')}</option></select></label><label>{t('Tell us about your practice')}<textarea rows={6} value={requestMessage} onChange={e=>setRequestMessage(e.target.value)} placeholder={t('Describe your services, qualifications, or clinic.')}/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy||requestMessage.trim().length<20} onClick={()=>void requestAccount()}><Send size={16}/>{t('Request verification')}</button></>}</div></section></div>;

  return <div className="provider-page">
    <header className="page-head compact"><div><p className="eyebrow">{t('Asterivum Atlas')}</p><h1>{t('Your professional listings')}</h1><p className="muted">{t('Create a draft, document regulated specialties, and submit it for publication review.')}</p></div><button className="ghost" onClick={reset}><Plus size={16}/>{t('New listing')}</button></header>
    <div className="provider-layout">
      <aside className="provider-list">
        <strong>{t('My listings')}</strong>
        {listings.length===0&&<p className="muted">{t('No listings yet.')}</p>}
        {listings.map(listing=><button key={listing.id} className={id===listing.id?'active':''} onClick={()=>edit(listing)}><Building2 size={18}/><span><strong>{listing.draftPayload.name}</strong><small className={`listing-status ${listing.status.toLowerCase()}`}>{t(listing.status)}</small></span></button>)}
      </aside>
      <section className="provider-form">
        {error&&<div className="error">{error}</div>}{notice&&<div className="success"><CheckCircle2 size={16}/>{notice}</div>}
        {id&&listings.find(item=>item.id===id)?.moderationFeedback&&<div className="moderation-feedback"><strong>{t('Administrator feedback')}</strong><p>{listings.find(item=>item.id===id)?.moderationFeedback}</p></div>}
        <div className="form-section"><h2>{t('Public profile')}</h2><div className="form-grid">
          <label>{t('Listing type')}<select value={form.listingType} disabled={user.role!=='ADMIN'} onChange={e=>setForm({...form,listingType:e.target.value as DirectoryListingPayload['listingType']})}><option value="PRACTITIONER">{t('Practitioner')}</option><option value="CLINIC">{t('Clinic')}</option></select></label>
          <label>{t('Public name')}<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} maxLength={120}/></label>
          <label className="span-2">{t('Short summary')}<input value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} maxLength={240}/><small className="field-note">{form.summary.length}/240</small></label>
          <label className="span-2">{t('About the practice')}<textarea rows={6} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <label>{t('Languages (comma separated)')}<input value={languageText} onChange={e=>setLanguageText(e.target.value)}/></label>
          <label>{t('Website')}<input type="url" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} placeholder="https://"/></label>
          <label>{t('Email')}<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><span className="check"><input type="checkbox" checked={form.publishEmail} onChange={e=>setForm({...form,publishEmail:e.target.checked})}/>{t('Publish this email')}</span></label>
          <label>{t('Phone')}<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><span className="check"><input type="checkbox" checked={form.publishPhone} onChange={e=>setForm({...form,publishPhone:e.target.checked})}/>{t('Publish this phone')}</span></label>
        </div></div>
        <div className="form-section"><h2>{t('Specialties')}</h2><p className="muted">{t('Select only services you are qualified to provide. Regulated Portuguese therapies require a professional registration number before submission.')}</p><div className="specialty-picker">{specialties.map(item=><label key={item.id} className={form.specialtyIds.includes(item.id)?'selected':''}><input type="checkbox" checked={form.specialtyIds.includes(item.id)} onChange={()=>toggleSpecialty(item.id)}/><SpecialtyIcon iconKey={item.iconKey}/><span>{specialtyName(item)}</span>{item.regulated&&<small>{t('Regulated')}</small>}</label>)}</div>
          {regulatedSelected.map(specialty=>{const credential=form.credentials.find(item=>item.specialtyId===specialty.id);return <div className="credential-form" key={specialty.id}><strong>{specialtyName(specialty)}</strong><input placeholder={t('Qualification title')} value={credential?.title||''} onChange={e=>setForm({...form,credentials:[...form.credentials.filter(item=>item.specialtyId!==specialty.id),{specialtyId:specialty.id,title:e.target.value,issuer:credential?.issuer||'',registrationNumber:credential?.registrationNumber||''}]})}/><input placeholder={t('Issuing body')} value={credential?.issuer||''} onChange={e=>setForm({...form,credentials:[...form.credentials.filter(item=>item.specialtyId!==specialty.id),{specialtyId:specialty.id,title:credential?.title||'',issuer:e.target.value,registrationNumber:credential?.registrationNumber||''}]})}/><input placeholder={t('Professional registration number')} value={credential?.registrationNumber||''} onChange={e=>setForm({...form,credentials:[...form.credentials.filter(item=>item.specialtyId!==specialty.id),{specialtyId:specialty.id,title:credential?.title||'',issuer:credential?.issuer||'',registrationNumber:e.target.value}]})}/></div>;})}
        </div>
        <div className="form-section"><div className="section-title"><h2>{t('Locations')}</h2><button className="ghost small" onClick={()=>{setForm({...form,locations:[...form.locations,{...emptyLocation(),isPrimary:false}]});setLocationQueries([...locationQueries,'']);}}><Plus size={14}/>{t('Add location')}</button></div>
          {form.locations.map((location,index)=><article className="provider-location" key={index}><div className="location-number"><MapPin size={16}/><strong>{t('Location')} {index+1}</strong>{form.locations.length>1&&<button className="icon-btn danger" onClick={()=>{const next=form.locations.filter((_,i)=>i!==index);if(!next.some(item=>item.isPrimary))next[0].isPrimary=true;setForm({...form,locations:next});setLocationQueries(locationQueries.filter((_,i)=>i!==index));}}><Trash2 size={15}/></button>}</div>
            <div className="form-grid"><label className="span-2">{t('Search location')}<div className="location-field"><input value={locationQueries[index]||''} onChange={e=>searchLocation(index,e.target.value)} placeholder={t('Start typing a city or postal code')}/>{(locationResults[index]?.length||0)>0&&<div className="location-results">{locationResults[index].map(result=><button key={result.id} onClick={()=>selectLocation(index,result)}><strong>{result.name}</strong><span>{result.label}</span></button>)}</div>}</div></label>
            <label>{t('Address (optional)')}<input value={location.address} onChange={e=>updateLocation(index,{address:e.target.value})}/></label><label>{t('Postal code')}<input value={location.postalCode} onChange={e=>updateLocation(index,{postalCode:e.target.value})}/></label>
            <label>{t('Marker privacy')}<select value={location.markerPrecision} onChange={e=>updateLocation(index,{markerPrecision:e.target.value as 'EXACT'|'APPROXIMATE'})}><option value="APPROXIMATE">{t('Approximate area')}</option><option value="EXACT">{t('Exact address')}</option></select></label>
            <label className="check"><input type="radio" checked={location.isPrimary} onChange={()=>setForm({...form,locations:form.locations.map((item,i)=>({...item,isPrimary:i===index}))})}/>{t('Primary location')}</label>
            <div className="location-picture span-2">{location.imageUrl?<img src={location.imageUrl} alt={`${form.name} · ${location.label}`}/>:<span><Camera/><small>{t('No location picture')}</small></span>}<label className="ghost"><Camera size={15}/>{t(location.imageUrl?'Replace picture':'Add picture')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadLocationImage(index,file);}}/></label><small>{id?t('JPEG, PNG or WebP · maximum 5 MB'):t('Save the draft before uploading a picture.')}</small></div></div>
          </article>)}
        </div>
        <div className="form-section submission-consent"><h2>{t('Publication declaration')}</h2>
          <label className="check"><input type="checkbox" checked={confirmations.confirmAccuracy} onChange={e=>setConfirmations({...confirmations,confirmAccuracy:e.target.checked})}/>{t('I confirm that the identity, services and qualifications supplied are accurate.')}</label>
          <label className="check"><input type="checkbox" checked={confirmations.confirmPublication} onChange={e=>setConfirmations({...confirmations,confirmPublication:e.target.checked})}/>{t('I consent to publication of the fields marked public and understand their visibility.')}</label>
          <label className="check"><input type="checkbox" checked={confirmations.confirmClaims} onChange={e=>setConfirmations({...confirmations,confirmClaims:e.target.checked})}/>{t('I will not make misleading medical claims or present this directory as emergency care.')}</label>
        </div>
        <div className="provider-actions"><button className="ghost" disabled={busy} onClick={()=>void save()}><Save size={16}/>{t('Save draft')}</button><button className="primary" disabled={busy||!id||Object.values(confirmations).some(value=>!value)} onClick={()=>void submit()}><Send size={16}/>{t('Submit for review')}</button></div>
      </section>
    </div>
  </div>;
}
