import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Check, Clock3, Lightbulb, ShieldCheck, X } from 'lucide-react';
import { api } from './api';
import { useI18n } from './i18n';

type PlatformData={
  pageViews:{viewDate:string;pageKey:string;anonymousCount:number;authenticatedCount:number}[];
  eventCounts:{eventType:string;n:number}[];
  recentEvents:{id:number;eventType:string;entityType:string;entityId:number|null;metadata:Record<string,unknown>;createdAt:string;userName?:string;userEmail?:string}[];
  suggestions:{id:number;kind:string;suggestedNameEn:string;suggestedNamePt:string;message:string;createdAt:string;userName:string;userEmail:string}[];
  accountRequests:{id:number;name:string;email:string;accountType:string;verificationStatus:string;createdAt:string;requestMetadata?:{message?:string}}[];
};

export default function PlatformAdminView(){
  const {t,locale}=useI18n();
  const [data,setData]=useState<PlatformData>({pageViews:[],eventCounts:[],recentEvents:[],suggestions:[],accountRequests:[]});
  const [notes,setNotes]=useState<Record<string,string>>({}),[error,setError]=useState('');
  const load=()=>api<PlatformData>('/admin/platform').then(setData).catch(e=>setError((e as Error).message));
  useEffect(()=>{void load();},[]);
  const pages=useMemo(()=>Object.entries(data.pageViews.reduce<Record<string,{anonymous:number;authenticated:number}>>((result,row)=>{
    const item=result[row.pageKey]||{anonymous:0,authenticated:0};item.anonymous+=Number(row.anonymousCount);item.authenticated+=Number(row.authenticatedCount);result[row.pageKey]=item;return result;
  },{})).sort((a,b)=>(b[1].anonymous+b[1].authenticated)-(a[1].anonymous+a[1].authenticated)),[data.pageViews]);
  const decideAccount=async(id:number,action:'APPROVE'|'REJECT')=>{await api(`/admin/account-requests/${id}`,{method:'POST',body:JSON.stringify({action,note:notes[`account-${id}`]||''})});await load();};
  const decideSuggestion=async(id:number,action:'APPROVE'|'REJECT')=>{await api(`/admin/suggestions/${id}/decision`,{method:'POST',body:JSON.stringify({action,note:notes[`suggestion-${id}`]||'',iconKey:'sparkles'})});await load();};
  return <section className="platform-admin">
    <div className="section-title"><div><p className="eyebrow">{t('Website intelligence')}</p><h2>{t('Activity and page statistics')}</h2></div><span>{t('Last 30 days')}</span></div>
    {error&&<div className="error">{error}</div>}
    <div className="analytics-grid"><article><BarChart3/><strong>{data.pageViews.reduce((sum,row)=>sum+Number(row.anonymousCount)+Number(row.authenticatedCount),0)}</strong><span>{t('Page views')}</span></article><article><Activity/><strong>{data.eventCounts.find(item=>item.eventType==='LOGIN_SUCCESS')?.n||0}</strong><span>{t('Successful logins')}</span></article><article><ShieldCheck/><strong>{data.accountRequests.length}</strong><span>{t('Account requests')}</span></article><article><Lightbulb/><strong>{data.suggestions.length}</strong><span>{t('Suggestions pending')}</span></article></div>
    <div className="admin-insight-grid"><article className="table-card"><h3>{t('Most visited pages')}</h3>{pages.length===0?<p className="muted">{t('No page views recorded yet.')}</p>:<div className="page-stat-list">{pages.map(([key,value])=><div key={key}><strong>{t(key)}</strong><span>{value.anonymous+value.authenticated}</span><small>{value.anonymous} {t('guest')} · {value.authenticated} {t('registered')}</small></div>)}</div>}</article><article className="table-card"><h3>{t('Feature activity')}</h3><div className="page-stat-list">{data.eventCounts.slice(0,10).map(item=><div key={item.eventType}><strong>{t(item.eventType)}</strong><span>{item.n}</span></div>)}</div></article></div>
    {data.accountRequests.length>0&&<div className="review-section"><h2>{t('Professional account requests')}</h2><div className="review-cards">{data.accountRequests.map(item=><article key={item.id}><header><Badge type={item.accountType}/><div><strong>{item.name}</strong><small>{item.email} · {new Date(item.createdAt).toLocaleDateString(locale)}</small></div></header><p>{item.requestMetadata?.message}</p><label>{t('Administrator note')}<input value={notes[`account-${item.id}`]||''} onChange={e=>setNotes({...notes,[`account-${item.id}`]:e.target.value})}/></label><div><button className="primary" onClick={()=>void decideAccount(item.id,'APPROVE')}><Check size={14}/>{t('Approve')}</button><button className="ghost danger" onClick={()=>void decideAccount(item.id,'REJECT')}><X size={14}/>{t('Reject')}</button></div></article>)}</div></div>}
    {data.suggestions.length>0&&<div className="review-section"><h2>{t('Directory suggestions')}</h2><div className="review-cards">{data.suggestions.map(item=><article key={item.id}><header><Lightbulb/><div><strong>{item.suggestedNameEn||item.suggestedNamePt||t(item.kind)}</strong><small>{item.userName} · {item.userEmail}</small></div></header><p>{item.message}</p><label>{t('Administrator note')}<input value={notes[`suggestion-${item.id}`]||''} onChange={e=>setNotes({...notes,[`suggestion-${item.id}`]:e.target.value})}/></label><div><button className="primary" onClick={()=>void decideSuggestion(item.id,'APPROVE')}><Check size={14}/>{t('Approve')}</button><button className="ghost danger" onClick={()=>void decideSuggestion(item.id,'REJECT')}><X size={14}/>{t('Reject')}</button></div></article>)}</div></div>}
    <div className="table-card activity-log"><h3>{t('Recent activity')}</h3>{data.recentEvents.map(item=><div key={item.id}><Clock3/><span><strong>{t(item.eventType)}</strong><small>{item.userName||t('Guest/system')}{item.entityType&&` · ${item.entityType}${item.entityId?` #${item.entityId}`:''}`}</small></span><time>{new Date(item.createdAt).toLocaleString(locale)}</time></div>)}</div>
  </section>;
}

function Badge({type}:{type:string}){return <span className="account-type-badge">{type}</span>;}
