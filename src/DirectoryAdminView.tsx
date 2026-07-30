import { useEffect, useState } from 'react';
import { Building2, Check, Clock3, ExternalLink, MapPin, MessageSquareText, X } from 'lucide-react';
import { api } from './api';
import { useI18n } from './i18n';
import type { DirectoryListingPayload } from './types';

type Revision={
  id:number;listingId:number;payload:DirectoryListingPayload;status:string;adminNote:string;createdAt:string;
  listingStatus:string;publishedPayload:DirectoryListingPayload|null;ownerName:string;ownerEmail:string;
};
type Published={id:number;status:'APPROVED'|'SUSPENDED';publishedPayload:DirectoryListingPayload;moderationFeedback:string;updatedAt:string;ownerName:string;ownerEmail:string};

export default function DirectoryAdminView() {
  const {t,locale}=useI18n();
  const [data,setData]=useState<{revisions:Revision[];published:Published[];stats:Record<string,number>}>({revisions:[],published:[],stats:{}});
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState<number|null>(null),[error,setError]=useState('');
  const load=()=>api<typeof data>('/admin/directory').then(setData).catch(e=>setError((e as Error).message));
  useEffect(()=>{void load();},[]);
  const decide=async(revisionId:number,action:'APPROVE'|'REQUEST_CHANGES'|'REJECT')=>{
    setBusy(revisionId);setError('');
    try{await api(`/admin/directory/${revisionId}/decision`,{method:'POST',body:JSON.stringify({action,note:notes[revisionId]||''})});await load();}
    catch(e){setError((e as Error).message);}finally{setBusy(null);}
  };
  const setStatus=async(listing:Published)=>{
    const note=notes[-listing.id]||'';
    setBusy(-listing.id);setError('');
    try{await api(`/admin/directory/listings/${listing.id}/status`,{method:'POST',body:JSON.stringify({action:listing.status==='SUSPENDED'?'RESTORE':'SUSPEND',note})});await load();}
    catch(e){setError((e as Error).message);}finally{setBusy(null);}
  };
  return <section className="directory-admin">
    <div className="section-title"><div><p className="eyebrow">{t('Publication safety')}</p><h2>{t('Atlas moderation queue')}</h2></div><span>{data.revisions.length} {t('pending')}</span></div>
    <div className="directory-admin-stats">{['DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED'].map(status=><span key={status}><b>{Number(data.stats[status]||0)}</b>{t(status)}</span>)}</div>
    {error&&<div className="error">{error}</div>}
    {data.revisions.length===0?<div className="empty"><Check/><h3>{t('Moderation queue is clear')}</h3><p>{t('New or revised listings will appear here before publication.')}</p></div>:<div className="moderation-grid">{data.revisions.map(revision=>{
      const location=revision.payload.locations.find(item=>item.isPrimary)||revision.payload.locations[0];
      return <article className="moderation-card" key={revision.id}>
        <header><span>{revision.payload.listingType==='CLINIC'?<Building2/>:<MapPin/>}</span><div><h3>{revision.payload.name}</h3><small>{revision.ownerName} · {revision.ownerEmail}</small></div><i><Clock3 size={12}/>{new Date(revision.createdAt).toLocaleDateString(locale)}</i></header>
        <p><strong>{revision.payload.summary}</strong></p><p>{revision.payload.description}</p>
        <dl><div><dt>{t('Location')}</dt><dd>{location.label} · {location.markerPrecision}</dd></div><div><dt>{t('Contact')}</dt><dd>{revision.payload.email||'—'} · {revision.payload.phone||'—'} {revision.payload.website&&<a href={revision.payload.website} target="_blank" rel="noreferrer"><ExternalLink size={12}/></a>}</dd></div><div><dt>{t('Specialty IDs')}</dt><dd>{revision.payload.specialtyIds.join(', ')}</dd></div><div><dt>{t('Credentials')}</dt><dd>{revision.payload.credentials.map(item=>`${item.title} · ${item.issuer} · ${item.registrationNumber||'no number'}`).join(' | ')||'—'}</dd></div></dl>
        {revision.publishedPayload&&<div className="published-update">{t('An approved version remains public while this revision is reviewed.')}</div>}
        <label><MessageSquareText size={14}/>{t('Feedback / internal note')}<textarea rows={3} value={notes[revision.id]||''} onChange={e=>setNotes({...notes,[revision.id]:e.target.value})}/></label>
        <div className="moderation-actions"><button className="primary" disabled={busy===revision.id} onClick={()=>void decide(revision.id,'APPROVE')}><Check size={15}/>{t('Approve')}</button><button className="ghost" disabled={busy===revision.id||!(notes[revision.id]||'').trim()} onClick={()=>void decide(revision.id,'REQUEST_CHANGES')}><MessageSquareText size={15}/>{t('Request changes')}</button><button className="ghost danger" disabled={busy===revision.id} onClick={()=>void decide(revision.id,'REJECT')}><X size={15}/>{t('Reject')}</button></div>
      </article>;
    })}</div>}
    {data.published.length>0&&<div className="published-management"><div className="section-title"><div><p className="eyebrow">{t('Published directory')}</p><h2>{t('Publication status')}</h2></div></div><div className="table-card"><div className="admin-table"><table><thead><tr><th>{t('Listing')}</th><th>{t('Owner')}</th><th>{t('Status')}</th><th>{t('Moderation note')}</th><th/></tr></thead><tbody>{data.published.map(listing=><tr key={listing.id}><td><strong>{listing.publishedPayload.name}</strong><span>{listing.publishedPayload.listingType}</span></td><td><strong>{listing.ownerName}</strong><span>{listing.ownerEmail}</span></td><td><span className={`status ${listing.status.toLowerCase()}`}>{t(listing.status)}</span></td><td><input value={notes[-listing.id]||''} onChange={e=>setNotes({...notes,[-listing.id]:e.target.value})} placeholder={t('Reason / audit note')}/></td><td><button className={`ghost small ${listing.status==='APPROVED'?'danger':''}`} disabled={busy===-listing.id} onClick={()=>void setStatus(listing)}>{t(listing.status==='SUSPENDED'?'Restore':'Suspend')}</button></td></tr>)}</tbody></table></div></div></div>}
  </section>;
}
